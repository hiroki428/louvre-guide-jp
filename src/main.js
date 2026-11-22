import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_DURATIONS,
  FLOORS,
  FLOOR_NAMES,
  PLAYBACK_RATES,
  formatWorkCreatorMeta,
  formatWorkLocation
} from './app-config.js';
import {floorMapMarkup, wireFloorMap} from './floor-map.js';
import {floorGeoData} from './floor-map-geo.js';
import {buildNavigationView, indexNavigationGraph, navigationStateForSelection, navigationStateFromRoute} from './navigation.js';
import {advanceOnRouteAudio, destinationWorkId, playbackModeFor, validStoredProgress} from './route-progress.js';
import {correctLocation, findRoomCandidates} from './location-support.js';
import {audioLengthsFor, catalogWorks, priorityTierFor} from './catalog.js';
import {activePlanMeta, buildTimedRouteWorks, formatMinutesLabel, moveMyPlanItem, optimizeWorkOrder, paceSummaryFor, planStopEstimates, removeMyPlanItem, timeCourseBounds, toggleMyPlan} from './my-plan.js';

const bootStarted = performance.now();
const STORAGE_KEY = 'louvre-guide-state-v3';
const SESSION_PROGRESS_KEY = 'louvre-route-progress-v2';
// public/sw.js の AUDIO と同じ名前にすること。違うと保存した音声がオフラインで使われない。
const AUDIO_CACHE = 'louvre-audio-v2';

function readPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const persistedBoot = readPersistedState();
const skipSplashImmediate = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

document.title = APP_NAME;
const app = document.querySelector('#app');
const appBase = new URL('../', import.meta.url);
const iconUrl = new URL('icons/icon-192.png', appBase).href;
const monaUrl = new URL('images/mona.jpg', appBase).href;

if (!skipSplashImmediate) {
  app.innerHTML = `<div class="splash" data-skip-splash role="button" tabindex="0" aria-label="イントロをスキップ"><div class="gallery-arches" aria-hidden="true"></div><div class="splash-stage"><figure class="splash-mona-frame"><div class="splash-mona-mat"><img class="splash-mona-img" src="${monaUrl}" alt="モナ・リザ"></div><figcaption>La Joconde · Salle 711</figcaption></figure><div class="splash-brand-line"><img class="splash-icon" src="${iconUrl}" alt="${APP_NAME}"><span>LOUVRE SELF-GUIDE</span></div><h1>${APP_NAME}</h1><p>${APP_TAGLINE}</p><span class="splash-hint">タップでスキップ</span></div></div>`;
} else {
  app.innerHTML = `<div class="boot-loading"><p>読み込み中…</p></div>`;
}

const [works, routes, sources, navigationGraph, artworkImages, imageCredits] = await Promise.all([
  'works.json',
  'routes.json',
  'provenance.json',
  'navigation-graph.json',
  'artwork-images.json',
  'image-credits.json'
].map(async name => {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error(`${name} を読み込めません`);
  return response.json();
})).catch(error => {
  app.innerHTML = '<main class="error-screen"><h1>読み込みできませんでした</h1><p>通信状態を確認して再読み込みしてください。</p><button class="primary" onclick="location.reload()">再読み込み</button></main>';
  throw error;
});

const byId = Object.fromEntries(works.map(work => [work.id, work]));
const worksByFloorRoom = new Map();
for (const work of works) {
  if (work.locationPrecision === 'room' && work.room != null && work.floor != null) {
    const key = `${work.floor}:${work.room}`;
    if (!worksByFloorRoom.has(key)) worksByFloorRoom.set(key, []);
    worksByFloorRoom.get(key).push(work);
  }
}

const navigationIndex = indexNavigationGraph(navigationGraph);
const player = new Audio();
player.preload = 'none';
let playbackSerial = 0;
let noticeTimer = null;
let splashSkipped = false;

const clampRate = value => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.round(Math.min(2, Math.max(0.5, num)) * 100) / 100;
};

const maxRoutableCount = works.filter(w => w.locationPrecision === 'room' && navigationIndex.nodes.has(`work:${w.id}`)).length;
const initialMinutes = routes.some(r => r.kind !== 'theme' && r.minutes === persistedBoot?.minutes) ? persistedBoot.minutes : 90;
const initialBounds = timeCourseBounds(initialMinutes, maxRoutableCount);
const initialCustomTimedIds = Array.isArray(persistedBoot?.customTimedIds)
  ? persistedBoot.customTimedIds.filter(id => byId[id] && navigationIndex.nodes.has(`work:${id}`))
  : null;

const state = {
  appPhase: skipSplashImmediate ? 'main' : 'splash',
  hasChosenCourse: Boolean(persistedBoot?.hasChosenCourse),
  tab: ['map', 'plan', 'audio', 'settings'].includes(persistedBoot?.tab) ? persistedBoot.tab : 'map',
  planMode: persistedBoot?.planMode === 'myplan' ? 'myplan' : 'preset',
  routeId: routes.some(r => r.id === persistedBoot?.routeId)
    ? persistedBoot.routeId
    : (routes.find(r => r.kind !== 'theme' && r.minutes === persistedBoot?.minutes)?.id ?? routes[0]?.id ?? 'preset-90'),
  minutes: initialMinutes,
  customTimedIds: initialCustomTimedIds?.length ? initialCustomTimedIds : null,
  customTimedMinutes: initialCustomTimedIds?.length ? (Number(persistedBoot?.customTimedMinutes) || initialMinutes) : null,
  draftMinutes: initialMinutes,
  draftCount: initialCustomTimedIds?.length
    ? Math.max(initialBounds.min, Math.min(initialBounds.max, initialCustomTimedIds.length))
    : initialBounds.recommended,
  preferElevator: Boolean(persistedBoot?.preferElevator),
  facilityFilter: 'none',
  autoPlayNext: Boolean(persistedBoot?.autoPlayNext),
  largeText: Boolean(persistedBoot?.largeText),
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  myPlanIds: Array.isArray(persistedBoot?.myPlanIds) ? persistedBoot.myPlanIds.filter(id => byId[id]) : [],
  viewed: new Set(Array.isArray(persistedBoot?.viewed) ? persistedBoot.viewed.filter(id => byId[id]) : []),
  floor: Number.isFinite(persistedBoot?.floor) ? persistedBoot.floor : 1,
  selected: persistedBoot?.selected && byId[persistedBoot.selected] ? persistedBoot.selected : null,
  detailWorkId: null,
  detailRoomWorks: [],
  audioSettingsOpen: false,
  duration: DEFAULT_DURATIONS.includes(persistedBoot?.duration) ? persistedBoot.duration : 60,
  playbackRate: clampRate(persistedBoot?.playbackRate ?? 1),
  audioDurations: {},
  audioQuery: '',
  audioSort: 'rank-asc',
  audioFilter: 'all',
  playing: null,
  audio: null,
  audioError: '',
  downloaded: new Set(),
  bulkDownload: {active: false, done: 0, total: 0},
  navigation: null,
  player: {workId: null, mode: 'standalone', sessionId: 0, hasStarted: false, arrivalHandled: false},
  notice: null,
  undo: null,
  processedArrivalEvents: new Set(),
  support: {open: false, editing: false, room: '', candidates: [], selectedCandidateId: null, error: ''}
};

player.playbackRate = state.playbackRate;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const navOptions = () => ({preferElevator: state.preferElevator});
const currentPlan = () => activePlanMeta({
  planMode: state.planMode,
  routeId: state.routeId,
  minutes: state.minutes,
  routes,
  myPlanIds: state.myPlanIds,
  navigationIndex,
  duration: state.duration,
  customTimedIds: state.customTimedIds,
  customTimedMinutes: state.customTimedMinutes
});
const planWorks = () => currentPlan().ids.map(id => byId[id]).filter(Boolean);
const routableIds = () => currentPlan().routableIds;
const currentEstimates = () => planStopEstimates(currentPlan(), navigationIndex, navOptions());
const workStatus = work => formatWorkLocation(work);
const creatorMeta = work => formatWorkCreatorMeta(work);
const audioPath = (id, length) => new URL(`audio/${id}-${length}.mp3`, appBase).href;
const formatAudioLengthLabel = length => (length === 60 ? '標準 1分' : length === 120 ? '深掘り 2分' : length < 60 ? `${length}秒` : `${length / 60}分`);

function preferredLengthFor(work) {
  const lengths = audioLengthsFor(work);
  const chosen = state.audioDurations[work.id] ?? state.duration;
  return lengths.includes(chosen) ? chosen : lengths[0];
}

function validCustomNavigation(nav, ids) {
  if (!nav || !ids.length) return false;
  if (!navigationIndex.nodes.has(nav.currentNodeId)) return false;
  if (!nav.routeComplete && !navigationIndex.nodes.has(nav.destinationNodeId)) return false;
  if (!Array.isArray(nav.routeWorkIds) || nav.routeWorkIds.join('|') !== ids.join('|')) return false;
  if (!Array.isArray(nav.passedNodeIds) || nav.passedNodeIds.some(id => !navigationIndex.nodes.has(id))) return false;
  return true;
}

function restoreInitialNavigation() {
  if (state.planMode === 'myplan' || state.customTimedIds?.length) {
    const ids = routableIds();
    if (validCustomNavigation(persistedBoot?.navigation, ids)) {
      state.navigation = persistedBoot.navigation;
    } else {
      state.navigation = navigationStateFromRoute(navigationIndex, ids);
    }
    return;
  }
  const fromLocal = validStoredProgress(navigationIndex, routes, persistedBoot?.sessionProgress);
  if (fromLocal) {
    state.routeId = fromLocal.routeId ?? state.routeId;
    state.minutes = fromLocal.minutes;
    state.navigation = fromLocal.navigation;
    state.selected = fromLocal.selected ?? state.selected;
    state.floor = Number.isFinite(fromLocal.floor) ? fromLocal.floor : state.floor;
    return;
  }
  try {
    const legacy = validStoredProgress(navigationIndex, routes, JSON.parse(sessionStorage.getItem(SESSION_PROGRESS_KEY)));
    if (legacy) {
      state.routeId = legacy.routeId ?? state.routeId;
      state.minutes = legacy.minutes;
      state.navigation = legacy.navigation;
      state.selected = legacy.selected ?? state.selected;
      state.floor = Number.isFinite(legacy.floor) ? legacy.floor : state.floor;
      return;
    }
  } catch { /* ignore */ }
  state.navigation = navigationStateFromRoute(navigationIndex, routableIds());
}

restoreInitialNavigation();
if (!state.selected) {
  state.selected = currentPlan().ids[0] ?? works[0]?.id ?? null;
}

function persistState() {
  const plan = currentPlan();
  const sessionProgress = !plan.isCustom ? {
    version: 2,
    routeId: plan.id,
    minutes: plan.minutes,
    routeSignature: plan.ids.join('|'),
    navigation: state.navigation,
    selected: state.selected,
    floor: state.floor
  } : null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 3,
      hasChosenCourse: state.hasChosenCourse,
      tab: state.tab,
      planMode: state.planMode,
      routeId: state.routeId,
      minutes: state.minutes,
      customTimedIds: state.customTimedIds,
      customTimedMinutes: state.customTimedMinutes,
      preferElevator: state.preferElevator,
      autoPlayNext: state.autoPlayNext,
      largeText: state.largeText,
      myPlanIds: state.myPlanIds,
      viewed: [...state.viewed],
      floor: state.floor,
      selected: state.selected,
      duration: state.duration,
      playbackRate: state.playbackRate,
      navigation: state.navigation,
      sessionProgress
    }));
  } catch { /* localStorage optional */ }
  if (sessionProgress) {
    try { sessionStorage.setItem(SESSION_PROGRESS_KEY, JSON.stringify(sessionProgress)); }
    catch { /* sessionStorage optional */ }
  }
}

function navigationView() {
  return buildNavigationView(navigationIndex, state.navigation, navOptions());
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatRate(rate) {
  return `${Number(rate.toFixed(2))}x`;
}

function wingClass(wing) {
  return wing ? `wing-tint-${String(wing).toLowerCase()}` : 'wing-tint-unknown';
}

function thumbMarkup(work, sizeClass = '') {
  const image = artworkImages[work.id];
  const fallbackText = esc((work.title || '?').slice(0, 1));
  if (image?.src) {
    const src = new URL(image.src, appBase).href;
    return `<span class="work-thumb ${sizeClass} ${wingClass(work.wing)}"><img src="${src}" alt="${esc(work.title)}" loading="lazy" onerror="this.remove()"><em>${fallbackText}</em></span>`;
  }
  return `<span class="work-thumb ${sizeClass} ${wingClass(work.wing)}" aria-hidden="true"><em>${fallbackText}</em></span>`;
}

function priorityBadgeMarkup(work) {
  const tier = priorityTierFor(work);
  return `<span class="tier-badge tier-${tier.key}">${esc(tier.label)}</span>`;
}

function roomWorksFor(work) {
  if (!work || work.locationPrecision !== 'room' || work.room == null || work.floor == null) return [];
  return worksByFloorRoom.get(`${work.floor}:${work.room}`) || [work];
}

function miniPlayerContext() {
  const workId = state.player.workId;
  if (!workId || !byId[workId]) return null;
  const plan = currentPlan();
  const planIdx = plan.ids.indexOf(workId);
  if (planIdx >= 0) {
    return {
      work: byId[workId],
      source: 'plan',
      ids: plan.ids,
      index: planIdx,
      prevId: planIdx > 0 ? plan.ids[planIdx - 1] : null,
      nextId: planIdx < plan.ids.length - 1 ? plan.ids[planIdx + 1] : null,
      isLastInPlan: planIdx === plan.ids.length - 1
    };
  }
  const visibleIds = visibleAudioWorks().map(item => item.id);
  const catalogIdx = visibleIds.indexOf(workId);
  const listIds = catalogIdx >= 0 ? visibleIds : works.map(item => item.id);
  const idx = listIds.indexOf(workId);
  return {
    work: byId[workId],
    source: 'catalog',
    ids: listIds,
    index: idx,
    prevId: idx > 0 ? listIds[idx - 1] : null,
    nextId: idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null,
    isLastInPlan: false
  };
}

function setNotice(message, canUndo = false, duration = 5200) {
  if (noticeTimer) clearTimeout(noticeTimer);
  state.notice = {message, canUndo};
  noticeTimer = setTimeout(() => {
    state.notice = null;
    if (canUndo) state.undo = null;
    document.querySelector('.arrival-toast')?.remove();
    noticeTimer = null;
  }, duration);
}

function clearProgressNotice() {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
  state.notice = null;
  state.undo = null;
}

function updateMediaSession(work) {
  if (!('mediaSession' in navigator) || !work) return;
  try {
    const image = artworkImages[work.id];
    const artwork = image?.src ? [{src: new URL(image.src, appBase).href, sizes: '512x512', type: 'image/jpeg'}] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: work.title,
      artist: creatorMeta(work),
      album: APP_NAME,
      artwork
    });
    navigator.mediaSession.setActionHandler('play', () => {
      if (state.player.workId) toggleAudio(state.player.workId, preferredLengthFor(byId[state.player.workId]));
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (!player.paused) { player.pause(); state.playing = null; render(); }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => stepMiniPlayer(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => stepMiniPlayer(1));
    navigator.mediaSession.setActionHandler('seekbackward', details => seekBy(-(details?.seekOffset || 10)));
    navigator.mediaSession.setActionHandler('seekforward', details => seekBy(details?.seekOffset || 10));
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (Number.isFinite(details?.seekTime) && Number.isFinite(player.duration)) {
        player.currentTime = Math.max(0, Math.min(player.duration, details.seekTime));
        syncSeekBars();
      }
    });
  } catch { /* Media Session API optional */ }
}

function seekBy(deltaSeconds) {
  if (!state.player.workId || !Number.isFinite(player.duration)) return;
  player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + deltaSeconds));
  syncSeekBars();
}

function setPlaybackRate(rate, {rerender = true} = {}) {
  const next = clampRate(rate);
  state.playbackRate = next;
  player.playbackRate = next;
  persistState();
  if (rerender) {
    render();
  } else {
    document.querySelectorAll('[data-rate-readout]').forEach(el => { el.textContent = formatRate(next); });
    document.querySelectorAll('[data-set-rate]').forEach(btn => {
      btn.classList.toggle('active', Math.abs(Number(btn.dataset.setRate) - next) < 0.01);
    });
  }
}

let routeLoaderToken = 0;

function routeLoaderMarkup({title, subtitle, modeBadge, steps}) {
  return `<div class="route-loader-card">
    <div class="route-loader-visual" aria-hidden="true">
      <svg viewBox="0 0 220 118" fill="none">
        <defs>
          <linearGradient id="goldLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#c9a45c" stop-opacity="0.35"/>
            <stop offset="50%" stop-color="#f3d88e"/>
            <stop offset="100%" stop-color="#c9a45c" stop-opacity="0.8"/>
          </linearGradient>
        </defs>
        <g class="loader-pyramid">
          <polygon points="110,10 156,82 64,82" stroke="rgba(243,216,142,0.34)" stroke-width="1.2"/>
          <line x1="110" y1="10" x2="110" y2="82" stroke="rgba(243,216,142,0.22)" stroke-width="1"/>
          <line x1="87" y1="46" x2="133" y2="46" stroke="rgba(243,216,142,0.2)" stroke-width="1"/>
          <line x1="76" y1="64" x2="144" y2="64" stroke="rgba(243,216,142,0.18)" stroke-width="1"/>
        </g>
        <path class="loader-route-base" d="M 24 94 C 52 94, 56 64, 82 64 C 106 64, 114 34, 142 40 C 168 46, 174 24, 198 28"/>
        <path class="loader-route-trace" d="M 24 94 C 52 94, 56 64, 82 64 C 106 64, 114 34, 142 40 C 168 46, 174 24, 198 28" stroke="url(#goldLine)"/>
        <g class="loader-node is-lit" transform="translate(24 94)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(82 64)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(142 40)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(198 28)"><circle class="loader-node-ring" r="8"/><circle class="loader-node-core" r="3.5"/></g>
      </svg>
    </div>
    <div class="route-loader-kicker">
      <span>ROUTE DESIGNING</span>
      ${modeBadge ? `<em>${esc(modeBadge)}</em>` : ''}
    </div>
    <h2 class="route-loader-title">${esc(title)}</h2>
    ${subtitle ? `<p class="route-loader-sub">${esc(subtitle)}</p>` : ''}
    <ul class="route-loader-steps">
      ${steps.map((text, idx) => `<li data-loader-step="${idx}"><i aria-hidden="true"></i><span>${esc(text)}</span></li>`).join('')}
    </ul>
    <div class="route-loader-bar" aria-hidden="true"><span class="route-loader-bar-fill"></span></div>
  </div>`;
}

async function runWithRouteLoader({title, subtitle = '', modeBadge = '', steps, durationMs = 2200}, applyFn) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    applyFn();
    return;
  }
  const token = ++routeLoaderToken;
  document.querySelector('.route-loader-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'route-loader-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = routeLoaderMarkup({title, subtitle, modeBadge, steps});
  document.body.appendChild(overlay);

  const stepEls = [...overlay.querySelectorAll('[data-loader-step]')];
  const barEl = overlay.querySelector('.route-loader-bar-fill');
  const nodeEls = [...overlay.querySelectorAll('.loader-node')];
  const setStage = idx => {
    stepEls.forEach((el, i) => {
      el.classList.toggle('is-done', i < idx);
      el.classList.toggle('is-active', i === idx);
    });
    nodeEls.forEach((el, i) => {
      el.classList.toggle('is-lit', i <= idx + 1);
    });
    if (barEl) barEl.style.width = `${Math.min(100, Math.round(((idx + 1) / Math.max(1, stepEls.length)) * 100))}%`;
  };

  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
    setStage(0);
  });

  const stepDelay = Math.round(durationMs / Math.max(1, steps.length));
  for (let i = 1; i < steps.length; i += 1) {
    await new Promise(resolve => setTimeout(resolve, stepDelay));
    if (token !== routeLoaderToken) { overlay.remove(); return; }
    setStage(i);
  }
  await new Promise(resolve => setTimeout(resolve, Math.max(460, stepDelay)));
  if (token !== routeLoaderToken) { overlay.remove(); return; }

  applyFn();
  overlay.classList.add('is-leaving');
  await new Promise(resolve => setTimeout(resolve, 380));
  overlay.remove();
}

function setPreferElevator(prefer) {
  const next = Boolean(prefer);
  if (state.preferElevator === next) return;
  const apply = () => {
    state.preferElevator = next;
    persistState();
    setNotice(state.preferElevator ? 'エレベーター優先ルートに切り替えました' : '移動距離が最短のルートに切り替えました', false, 3200);
    render();
  };
  if (state.appPhase === 'main' && routableIds().length > 0) {
    runWithRouteLoader({
      title: next ? 'エレベーター優先ルートを計算中' : '最短距離ルートを再計算中',
      subtitle: currentPlan().label,
      modeBadge: next ? 'EV優先' : '最短距離',
      steps: [
        '館内フロアと階段・エレベーター接続を確認しています',
        next ? 'エレベーターを優先する階移動経路を探索しています' : '展示室間の最短経路を算出しています',
        '各作品の目安経過時間を更新しています'
      ],
      durationMs: 1650
    }, apply);
  } else {
    apply();
  }
}

function syncSeekBars() {
  const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const ratio = duration > 0 ? Math.round((current / duration) * 1000) : 0;
  document.querySelectorAll('[data-seek]').forEach(input => {
    const targetId = input.dataset.seekWork;
    if (!targetId || targetId === state.player.workId) {
      input.value = String(ratio);
      input.style.setProperty('--seek-pct', `${(ratio / 10).toFixed(1)}%`);
    }
  });
  document.querySelectorAll('[data-time-current]').forEach(el => {
    const targetId = el.dataset.timeWork;
    if (!targetId || targetId === state.player.workId) el.textContent = formatClock(current);
  });
  document.querySelectorAll('[data-time-total]').forEach(el => {
    const targetId = el.dataset.timeWork;
    if (!targetId || targetId === state.player.workId) el.textContent = duration > 0 ? formatClock(duration) : '--:--';
  });
}

function choosePresetCourse(routeIdOrMinutes, {goMap = true, animate = true} = {}) {
  const target = typeof routeIdOrMinutes === 'string'
    ? routes.find(item => item.id === routeIdOrMinutes)
    : routes.find(item => item.kind !== 'theme' && item.minutes === routeIdOrMinutes);
  const chosen = target || routes[0];
  const apply = () => {
    clearProgressNotice();
    state.planMode = 'preset';
    state.routeId = chosen.id;
    state.minutes = chosen.minutes;
    state.customTimedIds = null;
    state.customTimedMinutes = null;
    state.hasChosenCourse = true;
    const ids = routableIds();
    state.navigation = navigationStateFromRoute(navigationIndex, ids);
    state.selected = ids[0] ?? null;
    if (ids[0] && byId[ids[0]]?.floor != null) {
      state.floor = byId[ids[0]].floor;
    }
    state.appPhase = 'main';
    if (goMap) state.tab = 'map';
    persistState();
    render();
    window.scrollTo({top: 0});
  };
  if (!animate) {
    apply();
    return;
  }
  runWithRouteLoader({
    title: `${chosen.label}を編成中`,
    subtitle: `${chosen.ids.length}作品 · ${chosen.subtitle || '館内最短動線'}`,
    modeBadge: state.preferElevator ? 'エレベーター優先' : '最短一筆書き',
    steps: [
      '展示室とフロア構造を照合しています',
      state.preferElevator ? 'エレベーター優先の移動ルートを設計しています' : '上下往復のない最短動線を計算しています',
      '音声ガイドと目安経過時間を準備しています'
    ],
    durationMs: 2250
  }, apply);
}

function chooseTimedCourse(minutes, count, {goMap = true, animate = true} = {}) {
  const bounds = timeCourseBounds(minutes, maxRoutableCount);
  const safeCount = Math.max(bounds.min, Math.min(bounds.max, Math.round(Number(count) || bounds.recommended)));
  const pace = paceSummaryFor(bounds.minutes, safeCount, bounds);
  const apply = () => {
    clearProgressNotice();
    const built = buildTimedRouteWorks(works, navigationIndex, {
      minutes: bounds.minutes,
      count: safeCount,
      preferElevator: state.preferElevator
    });
    state.planMode = 'preset';
    state.routeId = `preset-${built.minutes}`;
    state.minutes = built.minutes;
    state.customTimedIds = built.ids;
    state.customTimedMinutes = built.minutes;
    state.draftMinutes = built.minutes;
    state.draftCount = built.count;
    state.hasChosenCourse = true;
    const ids = routableIds();
    state.navigation = navigationStateFromRoute(navigationIndex, ids);
    state.selected = ids[0] ?? null;
    if (ids[0] && byId[ids[0]]?.floor != null) {
      state.floor = byId[ids[0]].floor;
    }
    state.appPhase = 'main';
    if (goMap) state.tab = 'map';
    persistState();
    render();
    window.scrollTo({top: 0});
  };
  if (!animate) {
    apply();
    return;
  }
  runWithRouteLoader({
    title: `${bounds.minutes}分 · ${safeCount}作品ルートを編成中`,
    subtitle: `${pace.label}（推奨 ${bounds.recommended}作品 / 限界目安 ${bounds.max}作品）`,
    modeBadge: state.preferElevator ? 'エレベーター優先' : '最短一筆書き',
    steps: [
      `超有名作品から優先して ${safeCount}作品を選出しています`,
      state.preferElevator ? 'エレベーター優先の移動ルートを設計しています' : '上下往復のない最短一筆書きを探索しています',
      '各作品の目安経過時間と音声ガイドを準備しています'
    ],
    durationMs: 2250
  }, apply);
}

function chooseMyPlan({goMap = false, animate = true} = {}) {
  const apply = () => {
    clearProgressNotice();
    state.planMode = 'myplan';
    state.hasChosenCourse = true;
    const ids = routableIds();
    state.navigation = navigationStateFromRoute(navigationIndex, ids);
    state.selected = state.myPlanIds[0] ?? null;
    if (ids[0] && byId[ids[0]]?.floor != null) {
      state.floor = byId[ids[0]].floor;
    }
    state.appPhase = 'main';
    state.tab = goMap && ids.length ? 'map' : 'plan';
    persistState();
    render();
    window.scrollTo({top: 0});
  };
  if (!animate || !state.myPlanIds.length) {
    apply();
    return;
  }
  runWithRouteLoader({
    title: 'マイプランのルートを作成中',
    subtitle: `${state.myPlanIds.length}作品のお気に入りリスト`,
    modeBadge: state.preferElevator ? 'エレベーター優先' : 'カスタムルート',
    steps: [
      '選択された作品の展示室を確認しています',
      state.preferElevator ? 'エレベーター優先で館内経路を接続しています' : '入口からの館内移動ルートを計算しています',
      'プラン一覧と目安時間を仕上げています'
    ],
    durationMs: 2050
  }, apply);
}

function handleOptimizeMyPlan() {
  if (state.planMode !== 'myplan') return;
  const routableCount = routableIds().length;
  if (routableCount < 2) {
    setNotice('最短順に並び替えるには、展示室対応の作品が2件以上必要です', false, 3400);
    render();
    return;
  }
  runWithRouteLoader({
    title: 'マイプランを最短順に最適化中',
    subtitle: `対象 ${routableCount}作品 · ピラミッド入口から一筆書き探索`,
    modeBadge: state.preferElevator ? 'EV優先最適化' : '最短巡回探索',
    steps: [
      '全展示室間の移動距離行列を算出しています',
      '同じ展示室の作品をまとめて最短巡回順を探索しています',
      '最適化ルートと目安経過時間を反映しています'
    ],
    durationMs: 2150
  }, () => {
    const result = optimizeWorkOrder(navigationIndex, state.myPlanIds, navOptions());
    state.myPlanIds = result.ids;
    const nextRoutable = routableIds();
    state.navigation = navigationStateFromRoute(navigationIndex, nextRoutable);
    state.selected = result.ids[0] ?? null;
    if (nextRoutable[0] && byId[nextRoutable[0]]?.floor != null) {
      state.floor = byId[nextRoutable[0]].floor;
    }
    persistState();
    const message = result.changed
      ? (result.savedPercent > 0
        ? `最短順に並び替えました（移動距離 約${result.savedPercent}%短縮）`
        : '展示室がまとまる最短順に並び替えました')
      : 'すでに最短の順番になっています';
    setNotice(message, false, 4500);
    render();
  });
}

function syncMyPlanNavigation() {
  if (state.planMode !== 'myplan') return;
  const ids = routableIds();
  const currentDest = destinationWorkId(navigationIndex, state.navigation);
  if (ids.length && currentDest && ids.includes(currentDest)) {
    state.navigation = navigationStateForSelection(navigationIndex, ids, currentDest, navOptions());
  } else {
    state.navigation = navigationStateFromRoute(navigationIndex, ids);
  }
}

function selectRouteWork(workId, {focusFloor = false} = {}) {
  state.selected = workId;
  const ids = routableIds();
  if (ids.includes(workId)) {
    state.navigation = navigationStateForSelection(navigationIndex, ids, workId, navOptions());
  } else if (navigationIndex.nodes.has(`work:${workId}`)) {
    state.navigation = {
      ...(state.navigation || navigationStateFromRoute(navigationIndex, [workId])),
      destinationNodeId: `work:${workId}`,
      routeComplete: false
    };
  }
  if (focusFloor && byId[workId]?.floor != null) {
    state.floor = byId[workId].floor;
  }
  persistState();
}

async function stepMiniPlayer(delta, {forcePlay = false} = {}) {
  const ctx = miniPlayerContext();
  if (!ctx) return;
  const shouldPlay = forcePlay || Boolean(state.playing);
  const currentWork = ctx.work;

  if (delta > 0) {
    state.viewed.add(currentWork.id);
    if (ctx.source === 'plan') {
      const rIds = routableIds();
      if (ctx.nextId) {
        if (rIds.includes(ctx.nextId)) {
          state.navigation = navigationStateForSelection(navigationIndex, rIds, ctx.nextId, navOptions());
        } else if (rIds.includes(currentWork.id)) {
          const advanced = advanceOnRouteAudio(navigationIndex, state.navigation, rIds, currentWork.id, navOptions());
          if (advanced.updated) state.navigation = advanced.navigation;
        }
        state.selected = ctx.nextId;
        if (state.detailWorkId) state.detailWorkId = ctx.nextId;
        persistState();
        if (shouldPlay) {
          await toggleAudio(ctx.nextId, preferredLengthFor(byId[ctx.nextId]), {skipAutoAdvance: true});
        } else {
          player.pause();
          player.currentTime = 0;
          state.player = {workId: ctx.nextId, mode: playbackModeFor(navigationIndex, state.navigation, ctx.nextId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
          player.src = audioPath(ctx.nextId, preferredLengthFor(byId[ctx.nextId]));
          setNotice(`「${currentWork.title}」を完了し、次を「${byId[ctx.nextId].title}」に設定しました`, false, 3600);
          render();
        }
      } else {
        if (rIds.includes(currentWork.id)) {
          const advanced = advanceOnRouteAudio(navigationIndex, state.navigation, rIds, currentWork.id, navOptions());
          if (advanced.updated) state.navigation = advanced.navigation;
          else if (state.navigation) state.navigation = {...state.navigation, currentNodeId: `work:${currentWork.id}`, destinationNodeId: null, routeComplete: true};
        }
        player.pause();
        state.playing = null;
        persistState();
        setNotice(`「${currentWork.title}」を完了しました。コース完走おつかれさまでした！`, false, 4500);
        render();
      }
      return;
    }

    if (ctx.nextId) {
      state.selected = ctx.nextId;
      if (navigationIndex.nodes.has(`work:${ctx.nextId}`)) {
        selectRouteWork(ctx.nextId, {focusFloor: false});
      }
      if (state.detailWorkId) state.detailWorkId = ctx.nextId;
      persistState();
      if (shouldPlay) {
        await toggleAudio(ctx.nextId, preferredLengthFor(byId[ctx.nextId]), {skipAutoAdvance: true});
      } else {
        player.pause();
        player.currentTime = 0;
        state.player = {workId: ctx.nextId, mode: playbackModeFor(navigationIndex, state.navigation, ctx.nextId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
        player.src = audioPath(ctx.nextId, preferredLengthFor(byId[ctx.nextId]));
        render();
      }
    }
    return;
  }

  if (!ctx.prevId) return;
  const prevWork = byId[ctx.prevId];
  if (ctx.source === 'plan') {
    const rIds = routableIds();
    if (rIds.includes(ctx.prevId)) {
      state.navigation = navigationStateForSelection(navigationIndex, rIds, ctx.prevId, navOptions());
    }
  } else if (navigationIndex.nodes.has(`work:${ctx.prevId}`)) {
    selectRouteWork(ctx.prevId, {focusFloor: false});
  }
  state.selected = ctx.prevId;
  if (state.detailWorkId) state.detailWorkId = ctx.prevId;
  persistState();
  if (shouldPlay) {
    await toggleAudio(ctx.prevId, preferredLengthFor(prevWork), {skipAutoAdvance: true});
  } else {
    player.pause();
    player.currentTime = 0;
    state.player = {workId: ctx.prevId, mode: playbackModeFor(navigationIndex, state.navigation, ctx.prevId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
    player.src = audioPath(ctx.prevId, preferredLengthFor(prevWork));
    setNotice(`ターゲットを「${prevWork.title}」に戻しました`, false, 3200);
    render();
  }
}

function openWorkDetail(workId, roomWorkIds = null) {
  const work = byId[workId];
  if (!work) return;
  state.detailWorkId = workId;
  const siblings = Array.isArray(roomWorkIds) && roomWorkIds.length
    ? roomWorkIds.filter(id => byId[id])
    : roomWorksFor(work).map(item => item.id);
  state.detailRoomWorks = siblings.length > 1 ? siblings : [];
  render();
}

function closeWorkDetail() {
  if (!state.detailWorkId) return;
  state.detailWorkId = null;
  state.detailRoomWorks = [];
  render();
}

function handleToggleMyPlan(workId) {
  const result = toggleMyPlan(state.myPlanIds, workId);
  state.myPlanIds = result.ids;
  syncMyPlanNavigation();
  persistState();
  const title = byId[workId]?.title ?? '作品';
  setNotice(result.added ? `「${title}」をマイプランに追加しました` : `「${title}」をマイプランから外しました`, false, 3000);
  render();
}

function handleMoveMyPlan(workId, delta) {
  state.myPlanIds = moveMyPlanItem(state.myPlanIds, workId, delta);
  syncMyPlanNavigation();
  persistState();
  render();
}

function handleRemoveMyPlan(workId) {
  state.myPlanIds = removeMyPlanItem(state.myPlanIds, workId);
  syncMyPlanNavigation();
  persistState();
  render();
}

function toggleViewed(workId) {
  if (state.viewed.has(workId)) state.viewed.delete(workId);
  else state.viewed.add(workId);
  persistState();
  render();
}

function handleRouteArrival(workId, eventId) {
  if (state.processedArrivalEvents.has(eventId)) return false;
  state.processedArrivalEvents.add(eventId);
  const ids = routableIds();
  const result = advanceOnRouteAudio(navigationIndex, state.navigation, ids, workId, navOptions());
  if (!result.updated) return false;
  state.undo = {planMode: state.planMode, routeId: state.routeId, minutes: state.minutes, navigation: result.previous, selected: state.selected};
  state.navigation = result.navigation;
  state.selected = result.nextWorkId ?? workId;
  state.viewed.add(workId);
  persistState();
  const roomText = byId[workId]?.room ? `${byId[workId].room}室` : (byId[workId]?.title ?? '現在地');
  setNotice(`推定現在地を${roomText}として更新しました`, true, 6500);
  render();
  return true;
}

function undoArrival() {
  if (!state.undo) return;
  const snapshot = state.undo;
  state.planMode = snapshot.planMode;
  state.routeId = snapshot.routeId ?? state.routeId;
  state.minutes = snapshot.minutes;
  state.navigation = snapshot.navigation;
  state.selected = snapshot.selected;
  state.undo = null;
  persistState();
  setNotice('推定現在地と経路を元に戻しました', false, 3200);
  render();
}

async function toggleAudio(id, length, {skipAutoAdvance = false} = {}) {
  const work = byId[id];
  if (!work) return;
  const validLengths = audioLengthsFor(work);
  const resolvedLength = validLengths.includes(length) ? length : validLengths[0];
  state.audioDurations[id] = resolvedLength;
  state.audioError = '';

  const sameTrack = state.audio === player && state.player.workId === id && player.dataset?.audioLength === String(resolvedLength);
  if (sameTrack && !player.paused) {
    player.pause();
    state.playing = null;
    render();
    return;
  }
  if (sameTrack && state.player.hasStarted && !player.ended) {
    try {
      player.playbackRate = state.playbackRate;
      await player.play();
      state.playing = id;
      render();
      syncSeekBars();
    } catch {
      state.audioError = '音声を再開できません。通信状態または音声ファイルを確認してください。';
      render();
    }
    return;
  }

  if (state.audio === player) {
    player.pause();
    player.currentTime = 0;
  }
  const sessionId = ++playbackSerial;
  const mode = playbackModeFor(navigationIndex, state.navigation, id);
  state.player = {workId: id, mode, sessionId, hasStarted: false, arrivalHandled: false};
  state.audio = player;
  player.dataset.audioLength = String(resolvedLength);
  player.src = audioPath(id, resolvedLength);
  player.playbackRate = state.playbackRate;
  player.onended = () => {
    if (state.player.sessionId !== sessionId) return;
    state.playing = null;
    if (state.autoPlayNext) {
      const ctx = miniPlayerContext();
      if (ctx?.nextId) {
        stepMiniPlayer(1, {forcePlay: true});
        return;
      }
    }
    render();
    syncSeekBars();
  };
  try {
    await player.play();
    if (state.player.sessionId !== sessionId) return;
    state.player.hasStarted = true;
    state.playing = id;
    state.viewed.add(id);
    updateMediaSession(work);
    if (!skipAutoAdvance && mode === 'route' && !state.player.arrivalHandled) {
      state.player.arrivalHandled = true;
      if (handleRouteArrival(id, `playback-${sessionId}:${id}`)) {
        syncSeekBars();
        return;
      }
    }
    persistState();
    render();
    syncSeekBars();
  } catch {
    if (state.player.sessionId !== sessionId) return;
    state.playing = null;
    state.player.hasStarted = false;
    state.audioError = '音声を再生できません。通信状態または音声ファイルを確認してください。';
    render();
  }
}

async function saveSingleAudio(id, length) {
  if (!('caches' in window)) return false;
  const url = audioPath(id, length);
  const response = await fetch(url);
  if (!response.ok) throw new Error('audio unavailable');
  const cache = await caches.open(AUDIO_CACHE);
  await cache.put(url, response.clone());
  state.downloaded.add(`${id}-${length}`);
  state.audioDurations[id] = length;
  return true;
}

async function saveAudioButton(button, id, length) {
  button.disabled = true;
  button.textContent = '保存中…';
  try {
    await saveSingleAudio(id, length);
    setNotice(`「${byId[id]?.title ?? ''}」の音声を端末に保存しました`, false, 3000);
    render();
  } catch {
    button.textContent = '保存できません';
    button.disabled = false;
  }
}

async function downloadCurrentPlanAudio() {
  if (state.bulkDownload.active) return;
  const targets = planWorks();
  if (!targets.length) return;
  state.bulkDownload = {active: true, done: 0, total: targets.length};
  render();
  let success = 0;
  for (const work of targets) {
    const length = preferredLengthFor(work);
    const key = `${work.id}-${length}`;
    if (state.downloaded.has(key)) {
      success += 1;
      state.bulkDownload.done += 1;
      continue;
    }
    try {
      await saveSingleAudio(work.id, length);
      success += 1;
    } catch { /* continue remaining */ }
    state.bulkDownload.done += 1;
    render();
  }
  state.bulkDownload = {active: false, done: 0, total: 0};
  setNotice(`${success} / ${targets.length}作品の音声をオフライン保存しました`, false, 4000);
  render();
}

async function clearAudioCache() {
  if (!('caches' in window)) return;
  try {
    await caches.delete(AUDIO_CACHE);
    await caches.delete('louvre-audio-v1'); // 以前の版が誤って使っていた保存先の掃除
    state.downloaded.clear();
    setNotice('保存済みの音声データを削除しました', false, 3500);
    render();
  } catch {
    setNotice('音声データの削除に失敗しました', false, 3500);
    render();
  }
}

function lookupRoom(room) {
  state.support.room = room;
  state.support.candidates = findRoomCandidates(navigationIndex, works, room);
  state.support.selectedCandidateId = state.support.candidates.length === 1 ? state.support.candidates[0].nodeId : null;
  state.support.error = state.support.candidates.length ? '' : '部屋番号を確認してください';
  state.support.open = true;
  state.support.editing = true;
  render();
}

function confirmLocationCorrection() {
  const candidateId = state.support.selectedCandidateId;
  if (!candidateId) {
    state.support.error = state.support.candidates.length > 1 ? '翼と階を確認して候補を選択してください' : '部屋番号を確認してください';
    render();
    return;
  }
  const result = correctLocation(navigationIndex, state.navigation, candidateId, navOptions());
  if (!result.updated) {
    state.support.error = result.message;
    render();
    return;
  }
  const candidate = state.support.candidates.find(item => item.nodeId === candidateId);
  clearProgressNotice();
  state.navigation = result.navigation;
  state.support = {open: false, editing: false, room: '', candidates: [], selectedCandidateId: null, error: ''};
  persistState();
  setNotice(`推定現在地を${candidate?.label ?? '入力した部屋'}として更新しました`, false, 4200);
  render();
}

/* ==================== MARKUP ==================== */

function courseSelectView() {
  const timeRoutes = routes.filter(item => item.kind !== 'theme');
  const themeRoutes = routes.filter(item => item.kind === 'theme');
  const returnButton = state.hasChosenCourse
    ? `<button class="text-back-btn" type="button" data-cancel-course>← 今の画面に戻る</button>`
    : '';
  const isThemeActive = state.hasChosenCourse && state.planMode === 'preset' && themeRoutes.some(r => r.id === state.routeId);
  const selectedMinutes = state.draftMinutes || 90;
  const bounds = timeCourseBounds(selectedMinutes, maxRoutableCount);
  const selectedCount = Math.max(bounds.min, Math.min(bounds.max, Math.round(state.draftCount || bounds.recommended)));
  const pace = paceSummaryFor(bounds.minutes, selectedCount, bounds);
  const recPct = bounds.max > bounds.min
    ? Math.round(((bounds.recommended - bounds.min) / (bounds.max - bounds.min)) * 100)
    : 50;

  return `<main class="course-screen">
    ${returnButton}
    <div class="course-brand-row">
      <img class="course-brand-icon" src="${iconUrl}" alt="${APP_NAME}">
      <div class="eyebrow">YOUR VISIT · ${APP_NAME}</div>
    </div>
    <h1>時間と作品数でルートを作る</h1>
    <p class="course-lead">滞在時間と巡りたい作品数を選ぶと、超有名作品から優先して館内最短の一筆書きルートを自動編成します。</p>

    <section class="step-block" aria-label="ステップ1 滞在時間を選ぶ">
      <div class="step-head"><span class="step-num">STEP 1</span><strong>滞在時間を選ぶ</strong></div>
      <div class="time-pick-grid">
        ${timeRoutes.map(item => {
          const itemBounds = timeCourseBounds(item.minutes, maxRoutableCount);
          const isPicked = selectedMinutes === item.minutes;
          return `<button class="time-pick-card ${isPicked ? 'active' : ''}" type="button" data-pick-minutes="${item.minutes}" aria-pressed="${isPicked}">
            <strong>${item.minutes}<small>分</small></strong>
            <span>推奨 ${itemBounds.recommended}作品</span>
            <small>最大 ${itemBounds.max}作品</small>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="step-block count-picker-card" aria-label="ステップ2 作品数を選ぶ">
      <div class="step-head count-picker-head">
        <div>
          <span class="step-num">STEP 2</span>
          <strong>巡る作品数を選ぶ（${bounds.minutes}分）</strong>
        </div>
        <span class="pace-badge pace-${pace.key}" data-pace-badge>${esc(pace.label)}</span>
      </div>

      <div class="count-reference-row">
        <button type="button" class="ref-pill ref-recommended" data-set-recommended="${bounds.recommended}">
          ★ 推奨：<strong>${bounds.recommended}作品</strong>
        </button>
        <span class="ref-pill ref-limit">
          この時間の限界目安：<strong>最大 ${bounds.max}作品</strong>
        </span>
      </div>

      <div class="count-controls-row">
        <div class="count-slider-col">
          <input class="count-slider" type="range" min="${bounds.min}" max="${bounds.max}" step="1" value="${selectedCount}" data-count-slider aria-label="作品数スライダー">
          <div class="count-slider-marks" aria-hidden="true">
            <span>最小 ${bounds.min}</span>
            <span class="rec-mark" style="left:${recPct}%">▲ 推奨 ${bounds.recommended}</span>
            <span>限界 ${bounds.max}</span>
          </div>
        </div>
        <label class="count-number-box">
          <input type="number" min="${bounds.min}" max="${bounds.max}" inputmode="numeric" value="${selectedCount}" data-count-input aria-label="作品数を数値で入力">
          <span>作品</span>
        </label>
      </div>
      <p class="count-pace-detail" data-pace-detail>${esc(pace.detail)}</p>

      <div class="route-pref-bar route-pref-inline" role="group" aria-label="移動経路の優先設定">
        <span class="route-pref-label">移動経路の優先</span>
        <div class="route-pref-toggle">
          <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">最短距離</button>
          <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">エレベーター優先</button>
        </div>
      </div>

      <button type="button" class="primary start-timed-route-btn" data-start-timed-route>
        この条件で最短ルートを作成（${bounds.minutes}分 · <span data-cta-count>${selectedCount}</span>作品） →
      </button>
    </section>

    ${themeRoutes.length ? `<details class="theme-courses-disclosure" ${isThemeActive ? 'open' : ''}>
      <summary>
        <span>テーマ別コースを見る（${themeRoutes.length}種類）</span>
        <small>ダ・ヴィンチ巡り・名作彫刻・古代文明</small>
      </summary>
      <div class="theme-course-list">
        ${themeRoutes.map(item => {
          const isCurrent = state.hasChosenCourse && state.planMode === 'preset' && state.routeId === item.id;
          return `<button class="theme-course-card ${isCurrent ? 'active' : ''}" type="button" data-course-id="${esc(item.id)}">
            <div>
              <strong>${esc(item.label)}</strong>
              <small>${esc(item.subtitle)}</small>
            </div>
            <span class="course-badge">約${item.minutes}分 ›</span>
          </button>`;
        }).join('')}
      </div>
    </details>` : ''}
    <button class="course-custom-card ${state.hasChosenCourse && state.planMode === 'myplan' ? 'active' : ''}" type="button" data-choose-myplan>
      <div>
        <span class="eyebrow">CUSTOM PLAN</span>
        <strong>★ マイプランで回る</strong>
        <p>${state.myPlanIds.length ? `登録済み ${state.myPlanIds.length}作品（展示室確認済みの作品は自動で経路案内します）` : '200作品から見たい作品を選んで、自分だけの鑑賞ルートを作れます。'}</p>
      </div>
      <span class="arrow" aria-hidden="true">›</span>
    </button>
  </main>`;
}

function floorBannerMarkup(nav) {
  if (!nav.available || nav.complete || !nav.destinationNode) return '';
  const destFloor = nav.destinationNode.floor;
  if (destFloor === state.floor) return '';
  const destWork = byId[nav.destinationNode.workId];
  const label = FLOOR_NAMES[destFloor] ?? `${destFloor}階`;
  const room = destWork?.room ? `（${destWork.room}室）` : '';
  return `<div class="floor-jump-banner" role="region" aria-label="別階の目的地案内">
    <span>次の目的地は <strong>${esc(label)}${esc(room)}</strong> にあります</span>
    <button type="button" data-jump-floor="${destFloor}">${esc(label)}を表示 →</button>
  </div>`;
}

function navigationPanel(view, plan) {
  if (!plan.routableIds.length) {
    return `<section class="route-guidance route-empty">
      <div><span class="guidance-label">マイプラン案内</span><strong>マップ対応作品がまだ選ばれていません</strong></div>
      <p>「音声一覧」から展示室確認済みの作品を ★ 追加すると、入口からの最短ルートが表示されます。</p>
      <button class="secondary compact-btn" type="button" data-go-audio-mapped>マップ対応作品を見る（${works.filter(w => w.locationPrecision === 'room').length}作品）</button>
    </section>`;
  }
  if (!view.available) {
    return `<section class="route-guidance route-unavailable" role="status">
      <div><span class="guidance-label">経路を表示できません</span><strong>${esc(view.reason)}</strong></div>
      <p>壁を横断する推測線は表示しません。接続データの追加後に再計算できます。</p>
    </section>`;
  }
  const locationLabel = view.locationMethod === 'selection'
    ? '区間の開始地点'
    : ['audio', 'manual'].includes(view.locationMethod)
      ? '推定現在地'
      : '最後に確認した地点';
  if (view.complete) {
    return `<section class="route-guidance route-complete" aria-label="ルート完了">
      <div class="guidance-points">
        <div><span class="guidance-label">${locationLabel}</span><strong><i class="current-symbol"></i>${esc(view.currentNode.label)}</strong></div>
        <span class="guidance-arrow" aria-hidden="true">✓</span>
        <div><span class="guidance-label">進行状況</span><strong class="destination-name">ルート完了！</strong></div>
      </div>
      <p class="next-action"><span>おつかれさまでした</span>気になる作品があれば、マップ上のピンや音声一覧から自由に鑑賞できます。</p>
    </section>`;
  }
  const destinationWork = byId[view.destinationNode.workId];
  const transition = view.transitions[0];
  const estimates = currentEstimates();
  const destEst = destinationWork ? estimates[destinationWork.id] : null;
  return `<section class="route-guidance" aria-label="現在地から次の作品まで">
    <div class="guidance-points">
      <div>
        <span class="guidance-label">${locationLabel}</span>
        <strong><i class="current-symbol"></i>${esc(view.currentNode.label)}</strong>
      </div>
      <span class="guidance-arrow" aria-hidden="true">→</span>
      <button class="guidance-dest-btn" type="button" data-open-detail="${esc(destinationWork?.id || '')}">
        <span class="guidance-label">次の目的地（タップで詳細）</span>
        <strong class="destination-name">${esc(destinationWork?.title ?? view.destinationNode.label)}</strong>
        <small>${destinationWork ? esc(workStatus(destinationWork)) : ''}${destEst ? ` · ${esc(destEst.elapsedLabel)}` : ''}</small>
      </button>
    </div>
    <p class="next-action"><span>次にすること</span>${esc(view.nextAction)}</p>
    ${transition ? `<p class="transition-summary">${transition.to.floor > transition.from.floor ? '↑' : '↓'} ${esc(transition.message)}</p>` : ''}
  </section>`;
}

function movementSupportMarkup() {
  const support = state.support;
  const candidates = support.candidates.length
    ? `<fieldset class="room-candidates">
        <legend>${support.candidates.length > 1 ? '翼と階を確認して選択してください' : '入力した部屋を確認してください'}</legend>
        ${support.candidates.map(candidate => `<label><input type="radio" name="room-candidate" value="${esc(candidate.nodeId)}" ${support.selectedCandidateId === candidate.nodeId ? 'checked' : ''}><span><strong>${esc(candidate.room)}室</strong><small>${esc(candidate.wing)}翼 · ${esc(candidate.floorLabel)}</small></span></label>`).join('')}
      </fieldset>
      <button class="primary confirm-location" type="button" data-confirm-location>この部屋を推定現在地にする</button>`
    : '';
  const editor = support.editing
    ? `<form class="room-correction-form" data-room-search novalidate>
        <label for="room-number">部屋番号</label>
        <div class="room-input-row">
          <input id="room-number" name="room" inputmode="numeric" autocomplete="off" value="${esc(support.room)}" placeholder="例：711" aria-describedby="room-help room-error">
          <button class="secondary" type="submit">候補を確認</button>
        </div>
        <small id="room-help">入口付近や壁面に表示された番号を入力してください。</small>
        ${support.error ? `<p class="room-error" id="room-error" role="alert">${esc(support.error)}</p>` : ''}
        ${candidates}
      </form>`
    : '';
  return `<details class="movement-support" ${support.open ? 'open' : ''}>
    <summary>移動サポート（道に迷ったとき）</summary>
    <div class="movement-support-body">
      <button class="location-correction-trigger" type="button" data-edit-location>
        <span>現在地を修正する</span>
        <small>近くの展示室番号から最短ルートを再計算します</small>
      </button>
      ${editor}
    </div>
  </details>`;
}

function mapTabView(hasMini) {
  const plan = currentPlan();
  const nav = navigationView();
  const destinationId = nav.destinationNode?.workId ?? null;
  const floorWorkCounts = Object.fromEntries(FLOORS.map(f => {
    const anchors = floorGeoData.floors[String(f)]?.roomAnchors || {};
    return [f, works.filter(w => w.floor === f && w.locationPrecision === 'room' && Boolean(anchors[String(w.room)])).length];
  }));
  const viewedInPlan = planWorks().filter(w => state.viewed.has(w.id)).length;
  const currentFloorGeo = floorGeoData.floors[String(state.floor)];
  const wcCount = (currentFloorGeo?.facilities || []).filter(item => item.type === 'wc').length;
  const cafeCount = (currentFloorGeo?.facilities || []).filter(item => item.type === 'cafe').length;
  const emptyOrCompleteNote = !plan.routableIds.length
    ? `<section class="route-guidance route-empty">
        <div><span class="guidance-label">マイプラン案内</span><strong>マップ対応作品がまだ選ばれていません</strong></div>
        <p>「音声一覧」から展示室確認済みの作品を ★ 追加すると、入口からの最短ルートが表示されます。</p>
        <button class="secondary compact-btn" type="button" data-go-audio-mapped>マップ対応作品を見る（${works.filter(w => w.locationPrecision === 'room').length}作品）</button>
      </section>`
    : nav.complete
      ? `<section class="route-guidance route-complete" aria-label="ルート完了">
          <p class="next-action"><span>ルート完了！</span>おつかれさまでした。気になる作品があればマップ上のピンや音声一覧から自由に鑑賞できます。</p>
        </section>`
      : '';

  return `<main class="tab-screen map-screen ${hasMini ? 'has-mini-player' : ''}">
    <div class="map-frame">
      <div class="map-scroll">
        ${floorMapMarkup({
          floor: state.floor,
          floorLabel: FLOOR_NAMES[state.floor],
          works,
          selectedId: destinationId,
          navigation: nav,
          roomNotices: navigationGraph.roomNotices,
          routeWorkIds: plan.routableIds,
          viewedIds: state.viewed,
          facilityFilter: state.facilityFilter
        })}
      </div>
      <div class="map-controls" aria-label="地図の拡大縮小">
        <button type="button" data-map-action="in" aria-label="地図を拡大">＋</button>
        <output data-map-status aria-live="polite">100%</output>
        <button type="button" data-map-action="out" aria-label="地図を縮小">−</button>
        <button type="button" data-map-action="reset">全体</button>
      </div>
    </div>

    <div class="floor-tabs map-floor-tabs-below" role="tablist" aria-label="表示する階">
      ${FLOORS.map(floor => {
        const hasRoute = nav.routeFloors?.includes(floor);
        const count = floorWorkCounts[floor];
        return `<button type="button" data-floor="${floor}" class="${floor === state.floor ? 'active' : ''} ${hasRoute ? 'has-route' : ''}" aria-pressed="${floor === state.floor}">
          <span>${FLOOR_NAMES[floor]}</span>
          ${count ? `<small>${count}作</small>` : ''}
          ${hasRoute ? '<i aria-hidden="true"></i>' : ''}
        </button>`;
      }).join('')}
    </div>

    ${floorBannerMarkup(nav)}

    <div class="map-subbar" aria-label="施設ピックアップと経路モード">
      <div class="map-subtabs" role="tablist" aria-label="施設を強調表示">
        <button type="button" class="${state.facilityFilter === 'none' ? 'active' : ''}" data-facility-filter="none">作品表示</button>
        <button type="button" class="${state.facilityFilter === 'wc' ? 'active' : ''}" data-facility-filter="wc">トイレ (${wcCount})</button>
        <button type="button" class="${state.facilityFilter === 'cafe' ? 'active' : ''}" data-facility-filter="cafe">カフェ (${cafeCount})</button>
      </div>
      <div class="route-mode-subtoggle" role="group" aria-label="経路優先切替">
        <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">最短距離</button>
        <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">EV優先</button>
      </div>
    </div>

    <div class="map-toolbar map-toolbar-below">
      <div class="map-toolbar-meta">
        <strong>${esc(plan.label)}</strong>
        <span>${viewedInPlan} / ${plan.ids.length}作品 鑑賞済み</span>
      </div>
      <button type="button" class="pill-action-btn" data-open-plan>プラン一覧を見る ›</button>
    </div>

    ${emptyOrCompleteNote}
    ${state.facilityFilter === 'wc' && wcCount === 0 ? '<p class="map-tip">この階にトイレ情報はありません。他の階タブでご確認ください。</p>' : state.facilityFilter === 'cafe' && cafeCount === 0 ? '<p class="map-tip">この階にカフェ情報はありません（−2階・−1階・1階にあります）。</p>' : '<p class="map-tip">ピンをタップすると作品の詳細・音声再生が開きます（数字は回る順番、✓は鑑賞済み）。</p>'}
    ${movementSupportMarkup()}
  </main>`;
}

function planTabView(hasMini) {
  const plan = currentPlan();
  const items = planWorks();
  const estimates = currentEstimates();
  const destId = destinationWorkId(navigationIndex, state.navigation);
  const viewedInPlan = items.filter(w => state.viewed.has(w.id)).length;
  const pct = items.length ? Math.round((viewedInPlan / items.length) * 100) : 0;
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${preferredLengthFor(w)}`));
  const saveBtnText = state.bulkDownload.active
    ? `保存中 (${state.bulkDownload.done}/${state.bulkDownload.total})…`
    : allSaved
      ? 'すべてオフライン保存済み ✓'
      : `コース音声をまとめて保存 (${items.length}作品)`;

  return `<main class="tab-screen plan-screen ${hasMini ? 'has-mini-player' : ''}">
    <section class="plan-switcher" aria-label="コース選択">
      ${routes.map(r => {
        const shortLabel = r.kind === 'theme' ? r.label.replace(/＆.*/, '').replace(/タイムトラベル/, '') : `${r.minutes}分`;
        return `<button type="button" class="pill-btn ${!plan.isCustom && plan.id === r.id ? 'active' : ''}" data-switch-preset="${esc(r.id)}">${esc(shortLabel)}</button>`;
      }).join('')}
      <button type="button" class="pill-btn ${plan.isCustom ? 'active' : ''}" data-switch-myplan>★ マイプラン (${state.myPlanIds.length})</button>
    </section>

    <section class="plan-summary-card">
      <div class="plan-summary-top">
        <div>
          <span class="eyebrow">${plan.isCustom ? 'CUSTOM PLAN' : plan.kind === 'theme' ? 'THEME COURSE' : 'RECOMMENDED COURSE'}</span>
          <h1>${esc(plan.label)}</h1>
          ${plan.subtitle ? `<p class="plan-subtitle">${esc(plan.subtitle)}</p>` : ''}
        </div>
        <div class="plan-progress-badge">${viewedInPlan} / ${items.length} 鑑賞済み</div>
      </div>
      <div class="progress-bar" aria-label="鑑賞の進み具合"><span style="width:${pct}%"></span></div>
      ${items.length ? `<p class="plan-meta-line">目安 約${plan.estimatedMinutes}分（鑑賞 ${plan.visitMinutes}分 · 移動 ${plan.walkMinutes}分 · 音声 ${plan.audioMinutes}分 · 余裕 ${plan.bufferMinutes}分）</p>` : ''}
      ${items.length ? `<div class="plan-summary-actions">
        ${plan.isCustom && plan.routableIds.length >= 2 ? `<button type="button" class="optimize-plan-btn" data-optimize-myplan>✦ 最短順に並び替え</button>` : ''}
        <button type="button" class="secondary compact-btn" data-bulk-download ${state.bulkDownload.active || allSaved ? 'disabled' : ''}>${saveBtnText}</button>
        <div class="route-mode-subtoggle" role="group" aria-label="経路優先切替">
          <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">最短距離</button>
          <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">EV優先</button>
        </div>
      </div>` : ''}
    </section>

    ${!items.length ? `<section class="empty-plan-box">
      <h2>まだマイプランに作品がありません</h2>
      <p>全${works.length}作品の「音声一覧」やマップ上のピンから <strong>☆</strong> をタップして、見たい作品を自由に追加できます。</p>
      <button type="button" class="primary" data-go-audio-mapped>作品を選んで追加する</button>
    </section>` : `<ol class="plan-list">
      ${items.map((work, index) => {
        const isViewed = state.viewed.has(work.id);
        const isDest = work.id === destId;
        const isPlaying = state.playing === work.id;
        const hasMap = navigationIndex.nodes.has(`work:${work.id}`);
        const est = estimates[work.id];
        return `<li class="plan-card ${isDest ? 'is-destination' : ''} ${isViewed ? 'is-viewed' : ''}">
          <div class="plan-card-main" data-open-detail="${esc(work.id)}" role="button" tabindex="0">
            <span class="plan-order">${index + 1}</span>
            ${thumbMarkup(work, 'thumb-md')}
            <div class="plan-card-copy">
              <div class="plan-card-badges">
                ${priorityBadgeMarkup(work)}
                ${isDest ? '<span class="status-pill dest">次の目的地</span>' : isViewed ? '<span class="status-pill done">鑑賞済み ✓</span>' : '<span class="status-pill">予定</span>'}
                ${!hasMap ? '<span class="status-pill warn">経路対象外</span>' : ''}
              </div>
              <strong>${esc(work.title)}</strong>
              <small>${esc(creatorMeta(work))}</small>
              <div class="plan-meta-chips">
                <small class="plan-loc-line">${esc(workStatus(work))}</small>
                ${est ? `<span class="elapsed-pill">${esc(est.elapsedLabel)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="plan-card-actions">
            <button type="button" class="action-chip play-chip ${isPlaying ? 'active' : ''}" data-quick-play="${esc(work.id)}">${isPlaying ? '⏸ 停止' : '▶ 再生'}</button>
            ${hasMap ? `<button type="button" class="action-chip" data-show-map="${esc(work.id)}">地図</button>` : ''}
            <button type="button" class="action-chip ${isViewed ? 'done-chip' : ''}" data-toggle-viewed="${esc(work.id)}">${isViewed ? '✓ 済' : '済にする'}</button>
            ${plan.isCustom ? `
              <button type="button" class="icon-chip" data-move-myplan="${esc(work.id)}" data-delta="-1" ${index === 0 ? 'disabled' : ''} aria-label="上へ移動">↑</button>
              <button type="button" class="icon-chip" data-move-myplan="${esc(work.id)}" data-delta="1" ${index === items.length - 1 ? 'disabled' : ''} aria-label="下へ移動">↓</button>
              <button type="button" class="icon-chip danger" data-remove-myplan="${esc(work.id)}" aria-label="削除">✕</button>
            ` : ''}
          </div>
        </li>`;
      }).join('')}
    </ol>`}
    ${plan.isCustom && items.length ? `<div class="add-more-wrap"><button type="button" class="secondary" data-go-audio-mapped>＋ 音声一覧から作品を追加</button></div>` : ''}
  </main>`;
}

function visibleAudioWorks() {
  return catalogWorks(works, {
    query: state.audioQuery,
    sort: state.audioSort,
    filter: state.audioFilter,
    myPlanIds: state.myPlanIds
  });
}

function audioRowsMarkup(items) {
  if (!items.length) {
    return `<div class="empty-catalog"><p>条件に合う作品が見つかりませんでした。</p><button type="button" class="secondary compact-btn" data-reset-audio-filter>検索条件をリセット</button></div>`;
  }
  const myPlanSet = new Set(state.myPlanIds);
  return items.map(work => {
    const lengths = audioLengthsFor(work);
    const length = preferredLengthFor(work);
    const saved = state.downloaded.has(`${work.id}-${length}`);
    const inMyPlan = myPlanSet.has(work.id);
    const isPlaying = state.playing === work.id;
    const isMapped = work.locationPrecision === 'room' || work.locationPrecision === 'area';
    const locClass = work.locationPrecision === 'off-view'
      ? 'off-view'
      : work.locationPrecision === 'loan'
        ? 'loan'
        : isMapped
          ? 'mapped'
          : '';
    const lengthSelect = lengths.length > 1
      ? `<select data-audio-length="${esc(work.id)}" aria-label="${esc(work.title)} 音声の長さ">${lengths.map(opt => `<option value="${opt}" ${length === opt ? 'selected' : ''}>${formatAudioLengthLabel(opt)}</option>`).join('')}</select>`
      : '';
    return `<article class="audio-row ${state.selected === work.id ? 'selected' : ''} ${isPlaying ? 'is-playing' : ''}" id="audio-row-${esc(work.id)}">
      <div class="audio-row-main" data-open-detail="${esc(work.id)}" role="button" tabindex="0">
        ${thumbMarkup(work, 'thumb-sm')}
        <div class="audio-row-copy">
          <strong>${esc(work.title)}</strong>
          <small class="creator-sub">${esc(creatorMeta(work))}</small>
          <div class="audio-row-meta">
            ${priorityBadgeMarkup(work)}
            <span class="loc-tag ${locClass}">${esc(workStatus(work))}</span>
            ${saved ? '<span class="download-state saved">保存済</span>' : ''}
          </div>
        </div>
      </div>
      <div class="audio-row-controls">
        ${lengthSelect}
        <button type="button" class="star-btn ${inMyPlan ? 'active' : ''}" data-toggle-myplan="${esc(work.id)}" aria-label="マイプランに追加・解除" aria-pressed="${inMyPlan}">${inMyPlan ? '★' : '☆'}</button>
        <button type="button" class="play-btn ${isPlaying ? 'active' : ''}" data-audio-play="${esc(work.id)}" aria-label="${isPlaying ? '一時停止' : '再生'}">${isPlaying ? '⏸' : '▶'}</button>
        <button type="button" class="save-btn" data-audio-download="${esc(work.id)}" ${saved ? 'disabled' : ''}>${saved ? '✓' : '保存'}</button>
      </div>
    </article>`;
  }).join('');
}

function audioTabView(hasMini) {
  const visible = visibleAudioWorks();
  const topCount = works.filter(w => priorityTierFor(w).key === 'gold').length;
  const famousCount = works.filter(w => priorityTierFor(w).key === 'silver').length;
  const masterpieceCount = works.filter(w => priorityTierFor(w).key === 'bronze').length;
  const mappedCount = works.filter(w => w.locationPrecision === 'room').length;
  return `<main class="tab-screen audio-screen ${hasMini ? 'has-mini-player' : ''}">
    <section class="audio-header">
      <div class="audio-header-top">
        <div>
          <div class="eyebrow">AUDIO CATALOG</div>
          <h1>全${works.length}作品の音声ガイド</h1>
        </div>
        <button type="button" class="audio-settings-trigger" data-open-audio-settings aria-label="オーディオ設定を開く">
          <span aria-hidden="true">⚙</span>
          <span>音声設定 (${formatRate(state.playbackRate)})</span>
        </button>
      </div>
    </section>
    <section class="audio-catalog" aria-label="作品の音声一覧">
      <div class="audio-search-bar">
        <input type="search" data-audio-search value="${esc(state.audioQuery)}" placeholder="作品名・制作者・年号・部屋番号（例：モナリザ、だびんち、711）" aria-label="作品名・制作者・年号・部屋番号で検索">
        <button type="button" class="search-clear-btn ${state.audioQuery ? '' : 'hidden'}" data-clear-search aria-label="検索文字をクリア">✕</button>
      </div>
      <div class="filter-chips" role="group" aria-label="絞り込み">
        <button type="button" class="filter-chip ${state.audioFilter === 'all' ? 'active' : ''}" data-audio-filter="all">すべて (${works.length})</button>
        <button type="button" class="filter-chip chip-gold ${state.audioFilter === 'top' ? 'active' : ''}" data-audio-filter="top">超有名 (${topCount})</button>
        <button type="button" class="filter-chip chip-silver ${state.audioFilter === 'famous' ? 'active' : ''}" data-audio-filter="famous">有名 (${famousCount})</button>
        <button type="button" class="filter-chip chip-bronze ${state.audioFilter === 'masterpiece' ? 'active' : ''}" data-audio-filter="masterpiece">傑作 (${masterpieceCount})</button>
        <button type="button" class="filter-chip ${state.audioFilter === 'mapped' ? 'active' : ''}" data-audio-filter="mapped">展示室あり (${mappedCount})</button>
        <button type="button" class="filter-chip ${state.audioFilter === 'myplan' ? 'active' : ''}" data-audio-filter="myplan">★ マイプラン (${state.myPlanIds.length})</button>
      </div>
      <div class="audio-sort-row">
        <span class="audio-count" aria-live="polite">${visible.length} / ${works.length}作品</span>
        <label class="sort-select-wrap">
          <span>並び順</span>
          <select data-audio-sort>
            <option value="rank-asc" ${state.audioSort === 'rank-asc' ? 'selected' : ''}>評価・おすすめ順</option>
            <option value="title-asc" ${state.audioSort === 'title-asc' ? 'selected' : ''}>作品名 昇順</option>
            <option value="title-desc" ${state.audioSort === 'title-desc' ? 'selected' : ''}>作品名 降順</option>
            <option value="room-asc" ${state.audioSort === 'room-asc' ? 'selected' : ''}>部屋番号 昇順</option>
            <option value="room-desc" ${state.audioSort === 'room-desc' ? 'selected' : ''}>部屋番号 降順</option>
          </select>
        </label>
      </div>
      <div class="audio-list">${audioRowsMarkup(visible)}</div>
    </section>
  </main>`;
}

function settingsTabView(hasMini) {
  const plan = currentPlan();
  const items = planWorks();
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${preferredLengthFor(w)}`));
  const saveBtnText = state.bulkDownload.active
    ? `保存中 (${state.bulkDownload.done}/${state.bulkDownload.total})…`
    : allSaved
      ? '現在コースの音声はすべて保存済み ✓'
      : `現在の${plan.label}を一括保存 (${items.length}作品)`;

  return `<main class="tab-screen other-page ${hasMini ? 'has-mini-player' : ''}">
    <div class="eyebrow">SETTINGS & INFORMATION</div>
    <h1>案内・設定</h1>
    <p class="information-lead">館内では電波が弱くなる場所があります。出発前にコースの音声を端末へ保存しておくと安心です。</p>

    <section class="settings-card">
      <h2>オフライン保存・再生・経路設定</h2>
      <div class="setting-row">
        <div>
          <strong>オフライン音声キャッシュ</strong>
          <small>端末に保存済み：${state.downloaded.size} ファイル</small>
        </div>
        <div class="setting-actions">
          <button type="button" class="primary compact-btn" data-bulk-download ${!items.length || state.bulkDownload.active || allSaved ? 'disabled' : ''}>${saveBtnText}</button>
          ${state.downloaded.size ? `<button type="button" class="secondary compact-btn" data-clear-cache>保存済み音声を削除</button>` : ''}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>移動経路の優先</strong>
          <small>最短距離またはエレベーター優先ルートを切り替えられます</small>
        </div>
        <div class="route-mode-subtoggle">
          <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">最短距離</button>
          <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">エレベーター優先</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>音声速度（現在 <span data-rate-readout>${formatRate(state.playbackRate)}</span>）</strong>
          <small>解説の読み上げスピードを変更できます</small>
        </div>
        <div class="rate-chips">
          ${PLAYBACK_RATES.map(r => `<button type="button" class="chip ${Math.abs(state.playbackRate - r) < 0.01 ? 'active' : ''}" data-set-rate="${r}">${r}x</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>次の作品へ自動連続再生</strong>
          <small>解説が終了したら自動的に次の作品の音声を再生します</small>
        </div>
        <button type="button" class="chip ${state.autoPlayNext ? 'active' : ''}" data-toggle-autoplay aria-pressed="${state.autoPlayNext}">${state.autoPlayNext ? 'ON' : 'OFF'}</button>
      </div>
      <div class="setting-row">
        <div>
          <strong>解説テキストの文字サイズ</strong>
          <small>作品詳細の解説文を読みやすく調整できます</small>
        </div>
        <div class="rate-chips">
          <button type="button" class="chip ${!state.largeText ? 'active' : ''}" data-set-large-text="false">標準</button>
          <button type="button" class="chip ${state.largeText ? 'active' : ''}" data-set-large-text="true">大きめ</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>標準の音声の長さ（対応作品）</strong>
          <small>4段階対応の名作で初期選択される長さ</small>
        </div>
        <div class="rate-chips">
          ${DEFAULT_DURATIONS.map(d => `<button type="button" class="chip ${state.duration === d ? 'active' : ''}" data-default-duration="${d}">${formatAudioLengthLabel(d)}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>鑑賞の進捗をリセット</strong>
          <small>鑑賞済みチェックと現在地を最初に戻します（マイプランは保持）</small>
        </div>
        <button type="button" class="secondary compact-btn" data-reset-progress>進捗をリセット</button>
      </div>
    </section>

    <section class="visit-note">
      <h2>ご利用前の確認・情報について</h2>
      <ul class="information-list">
        <li><strong>展示位置・開室状況</strong><span>展示室や作品位置、開室状況は変更される可能性があります。当日は館内表示を優先してください。</span></li>
        <li><strong>情報更新日</strong><span>情報更新日：${esc(sources.checkedAt)}（全200作品を公式収蔵DBと照合済み）</span></li>
        <li><strong>公式館内マップ</strong><a href="${esc(sources.officialMap)}" target="_blank" rel="noreferrer">インタラクティブ館内マップを見る ↗</a></li>
        <li><strong>公式 展示室別プラン</strong><a href="${esc(sources.collectionsPlan || 'https://collections.louvre.fr/en/plan')}" target="_blank" rel="noreferrer">展示室ごとの収蔵品を見る ↗</a></li>
        <li><strong>公式 収蔵品DB</strong><a href="${esc(sources.collections || 'https://collections.louvre.fr/')}" target="_blank" rel="noreferrer">Louvre Collections を開く ↗</a></li>
        <li><strong>公式開室状況</strong><a href="${esc(sources.availability)}" target="_blank" rel="noreferrer">本日の利用可能な展示室を確認 ↗</a></li>
        <li><strong>サービスについて</strong><span>本サービスはルーブル美術館の公認サービスではありません。</span></li>
      </ul>
    </section>

    <section class="data-scope">
      <h2>地図・経路データについて</h2>
      <p>階別地図の建物輪郭、部屋番号、通路、扉、移動設備、主要施設、作品位置は公式館内マップおよび館内建築データを基準に再構成しています。展示室の開室状況は当日の館内表示を優先してください。</p>
      <details class="image-credits">
        <summary>作品画像の出典・ライセンス（${imageCredits.length}件）</summary>
        ${imageCredits.map(c => `<p>${esc(c.file)} · ${esc(c.artist.replace(/<[^>]*>/g, ''))} · ${esc(c.license)} <a target="_blank" rel="noreferrer" href="https://commons.wikimedia.org/wiki/${encodeURIComponent(c.file)}">出典 ↗</a></p>`).join('')}
      </details>
    </section>
  </main>`;
}

function closeMiniPlayer() {
  playbackSerial += 1;
  player.pause();
  player.currentTime = 0;
  state.playing = null;
  state.audio = null;
  state.audioError = '';
  state.player = {workId: null, mode: 'standalone', sessionId: playbackSerial, hasStarted: false, arrivalHandled: false};
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'none'; } catch { /* ignore */ }
  }
  render();
}

function miniPlayerMarkup() {
  const ctx = miniPlayerContext();
  if (!ctx) return '';
  const {work, prevId, nextId, isLastInPlan} = ctx;
  const isPlaying = state.playing === work.id;
  const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const ratio = duration > 0 ? Math.round((current / duration) * 1000) : 0;
  const pct = (ratio / 10).toFixed(1);
  return `<aside class="mini-player spotify-bar" aria-label="再生中のオーディオプレイヤー">
    <div class="mini-progress-wrap">
      <input class="mini-seek" type="range" min="0" max="1000" value="${ratio}" style="--seek-pct:${pct}%" data-seek data-seek-work="${esc(work.id)}" aria-label="再生位置を調整">
    </div>
    <div class="mini-player-row">
      <button type="button" class="mini-info" data-open-detail="${esc(work.id)}">
        ${thumbMarkup(work, 'thumb-mini')}
        <span class="mini-copy">
          <strong>${esc(work.title)}</strong>
          <small>${esc(creatorMeta(work))}</small>
          <span class="mini-time-line"><span data-time-current data-time-work="${esc(work.id)}">${formatClock(current)}</span> / <span data-time-total data-time-work="${esc(work.id)}">${duration > 0 ? formatClock(duration) : '--:--'}</span></span>
        </span>
      </button>
      <div class="mini-controls" aria-label="再生コントロール">
        <button type="button" class="mini-ctrl-btn" data-mini-prev aria-label="1つ前の作品へ戻る" title="前へ戻る" ${!prevId ? 'disabled' : ''}>⏮</button>
        <button type="button" class="mini-play-btn ${isPlaying ? 'active' : ''}" data-mini-play="${esc(work.id)}" aria-label="${isPlaying ? '一時停止' : '再生'}" title="${isPlaying ? '一時停止' : '再生'}">${isPlaying ? '⏸' : '▶'}</button>
        <button type="button" class="mini-ctrl-btn" data-mini-next aria-label="${isLastInPlan ? 'この作品を完了にする' : '現在の作品を完了して次へ進む'}" title="${isLastInPlan ? '完了' : '次へ進む'}" ${!nextId && !isLastInPlan ? 'disabled' : ''}>⏭</button>
        <span class="mini-divider" aria-hidden="true"></span>
        <button type="button" class="mini-close-btn" data-mini-close aria-label="プレイヤーを閉じる" title="プレイヤーを閉じる">✕</button>
      </div>
    </div>
  </aside>`;
}

function audioSettingsModalMarkup() {
  if (!state.audioSettingsOpen) return '';
  return `<div class="sheet-backdrop" data-close-audio-settings></div>
  <section class="audio-settings-sheet" role="dialog" aria-modal="true" aria-label="オーディオ設定">
    <div class="sheet-handle-bar">
      <h2>オーディオ設定</h2>
      <button type="button" class="sheet-close-btn" data-close-audio-settings aria-label="閉じる">✕ 閉じる</button>
    </div>
    <div class="audio-setting-block">
      <div class="audio-setting-head">
        <strong>音声速度</strong>
        <span class="rate-value-badge" data-rate-readout>${formatRate(state.playbackRate)}</span>
      </div>
      <input class="rate-slider" type="range" min="0.5" max="2" step="0.05" value="${state.playbackRate}" data-rate-slider aria-label="音声速度スライダー">
      <div class="rate-slider-scale"><span>0.5x ゆっくり</span><span>1.0x 標準</span><span>2.0x 速い</span></div>
      <div class="rate-chips">
        ${PLAYBACK_RATES.map(r => `<button type="button" class="chip ${Math.abs(state.playbackRate - r) < 0.01 ? 'active' : ''}" data-set-rate="${r}">${r}x</button>`).join('')}
      </div>
    </div>
    <div class="audio-setting-block audio-setting-inline">
      <div>
        <strong>次の作品へ自動連続再生</strong>
        <small>再生終了後に自動で次の作品へ移ります</small>
      </div>
      <button type="button" class="chip ${state.autoPlayNext ? 'active' : ''}" data-toggle-autoplay aria-pressed="${state.autoPlayNext}">${state.autoPlayNext ? 'ON' : 'OFF'}</button>
    </div>
    <div class="audio-setting-block audio-setting-inline">
      <div>
        <strong>解説テキストの文字サイズ</strong>
        <small>作品詳細の読みやすさを調整します</small>
      </div>
      <div class="rate-chips">
        <button type="button" class="chip ${!state.largeText ? 'active' : ''}" data-set-large-text="false">標準</button>
        <button type="button" class="chip ${state.largeText ? 'active' : ''}" data-set-large-text="true">大きめ</button>
      </div>
    </div>
    <div class="audio-setting-block">
      <div class="audio-setting-head">
        <strong>標準の解説の長さ（複数対応作品）</strong>
      </div>
      <div class="rate-chips">
        ${DEFAULT_DURATIONS.map(d => `<button type="button" class="chip ${state.duration === d ? 'active' : ''}" data-default-duration="${d}">${formatAudioLengthLabel(d)}</button>`).join('')}
      </div>
    </div>
  </section>`;
}

function workDetailSheetMarkup() {
  const work = state.detailWorkId ? byId[state.detailWorkId] : null;
  if (!work) return '';
  const plan = currentPlan();
  const planIdx = plan.ids.indexOf(work.id);
  const estimates = currentEstimates();
  const est = estimates[work.id];
  const lengths = audioLengthsFor(work);
  const length = preferredLengthFor(work);
  const saved = state.downloaded.has(`${work.id}-${length}`);
  const inMyPlan = state.myPlanIds.includes(work.id);
  const isViewed = state.viewed.has(work.id);
  const isPlaying = state.playing === work.id;
  const isLoaded = state.player.workId === work.id;
  const duration = isLoaded && Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const current = isLoaded && Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const ratio = duration > 0 ? Math.round((current / duration) * 1000) : 0;
  const pct = (ratio / 10).toFixed(1);
  const hasMap = navigationIndex.nodes.has(`work:${work.id}`);
  const siblings = state.detailRoomWorks.length > 1
    ? state.detailRoomWorks.map(id => byId[id]).filter(Boolean)
    : roomWorksFor(work);

  return `<div class="sheet-backdrop" data-close-detail></div>
  <section class="work-sheet ${state.largeText ? 'large-text' : ''}" role="dialog" aria-modal="true" aria-label="${esc(work.title)}の詳細">
    <div class="sheet-handle-bar">
      <span class="sheet-grabber" aria-hidden="true"></span>
      <button type="button" class="sheet-close-btn" data-close-detail aria-label="閉じる">✕ 閉じる</button>
    </div>

    ${siblings.length > 1 ? `<div class="room-siblings" aria-label="この展示室のほかの作品">
      <span class="room-siblings-label">${esc(work.room)}室の作品 (${siblings.length}件)</span>
      <div class="room-siblings-list">
        ${siblings.map(item => `<button type="button" class="sibling-chip ${item.id === work.id ? 'active' : ''}" data-switch-detail="${esc(item.id)}">${esc(item.title)}</button>`).join('')}
      </div>
    </div>` : ''}

    <article class="work-detail-body">
      <div class="work-hero">
        ${thumbMarkup(work, 'thumb-hero')}
        <div class="work-hero-copy">
          <div class="eyebrow">${planIdx >= 0 ? `訪問 ${planIdx + 1} / ${plan.ids.length} · ` : ''}${esc(workStatus(work))}</div>
          ${est ? `<div class="detail-elapsed-line">目安経過 約${formatMinutesLabel(est.elapsedMinutes)}${plan.minutes ? ` / ${plan.minutes}分` : ''}</div>` : ''}
          <h2>${esc(work.title)}</h2>
          <p class="artist">${esc(creatorMeta(work))}</p>
          <div class="hero-badges">
            ${priorityBadgeMarkup(work)}
          </div>
        </div>
      </div>

      <div class="detail-quick-actions">
        <button type="button" class="action-pill ${inMyPlan ? 'active' : ''}" data-toggle-myplan="${esc(work.id)}">${inMyPlan ? '★ マイプラン済' : '☆ マイプラン'}</button>
        <button type="button" class="action-pill ${isViewed ? 'done' : ''}" data-toggle-viewed="${esc(work.id)}">${isViewed ? '✓ 鑑賞済み' : '鑑賞済みにする'}</button>
        ${hasMap ? `<button type="button" class="action-pill" data-show-map="${esc(work.id)}">地図で位置を見る</button>` : ''}
      </div>

      <div class="sheet-audio-box sticky-audio-box">
        <div class="sheet-audio-top">
          <h3>音声解説</h3>
          ${lengths.length > 1
            ? `<div class="durations">${lengths.map(opt => `<button type="button" class="chip ${length === opt ? 'active' : ''}" data-detail-duration="${opt}" data-detail-work="${esc(work.id)}">${formatAudioLengthLabel(opt)}</button>`).join('')}</div>`
            : `<span class="minor">解説ガイド（約${lengths[0] === 60 ? '1分' : `${lengths[0]}秒`}）</span>`}
        </div>
        <div class="sheet-seek-wrap">
          <input type="range" min="0" max="1000" value="${ratio}" style="--seek-pct:${pct}%" data-seek data-seek-work="${esc(work.id)}" aria-label="再生位置を調整">
          <div class="sheet-time-row">
            <span data-time-current data-time-work="${esc(work.id)}">${formatClock(current)}</span>
            <span data-time-total data-time-work="${esc(work.id)}">${duration > 0 ? formatClock(duration) : '--:--'}</span>
          </div>
        </div>
        <div class="sheet-player-controls">
          <button type="button" class="secondary compact-btn" data-seek-delta="-10" ${!isLoaded ? 'disabled' : ''}>−10秒</button>
          <button type="button" class="primary sheet-play-main" data-detail-play="${esc(work.id)}">${isPlaying ? '⏸ 一時停止' : '▶ 音声を再生'}</button>
          <button type="button" class="secondary compact-btn" data-seek-delta="10" ${!isLoaded ? 'disabled' : ''}>＋10秒</button>
        </div>
        <div class="sheet-player-sub">
          <button type="button" class="secondary compact-btn" data-open-audio-settings>⚙ 速度 ${formatRate(state.playbackRate)}</button>
          <button type="button" class="secondary compact-btn" data-detail-download="${esc(work.id)}" ${saved ? 'disabled' : ''}>${saved ? 'オフライン保存済み ✓' : '端末に保存'}</button>
          ${planIdx >= 0 ? `
            <button type="button" class="secondary compact-btn" data-plan-step="${planIdx - 1}" ${planIdx <= 0 ? 'disabled' : ''}>⏮ 前の作品</button>
            <button type="button" class="secondary compact-btn" data-plan-step="${planIdx + 1}" ${planIdx >= plan.ids.length - 1 ? 'disabled' : ''}>次の作品 ⏭</button>
          ` : ''}
        </div>
        ${state.audioError ? `<p class="audio-error" role="alert">${esc(state.audioError)}</p>` : ''}
      </div>

      <div class="detail-text-section">
        <h3>作品の背景</h3>
        <p>${esc(work.background)}</p>
        <h3>鑑賞時に見るポイント</h3>
        <p>${esc(work.look)}</p>
      </div>

      <p class="source">展示室情報：<a href="${esc(work.source)}" target="_blank" rel="noreferrer">公式情報 ↗</a> · 確認日 ${esc(work.verifiedAt || sources.checkedAt)}</p>
    </article>
  </section>`;
}

function noticeMarkup(hasMini) {
  if (!state.notice) return '';
  return `<aside class="arrival-toast ${hasMini ? 'with-mini-player' : ''}" role="status" aria-live="polite">
    <span>${esc(state.notice.message)}</span>
    ${state.notice.canUndo ? '<button type="button" data-undo-arrival>元に戻す</button>' : ''}
  </aside>`;
}

function bottomTabsMarkup() {
  const tabs = [
    {id: 'map', label: 'マップ', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 7v13l6-3 6 3 6-3V4l-6 3-6-3Zm0 0v13m6-10v13"/></svg>'},
    {id: 'plan', label: 'プラン一覧', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'},
    {id: 'audio', label: '音声一覧', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2Zm16 0a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z"/></svg>'},
    {id: 'settings', label: '案内・設定', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z"/></svg>'}
  ];
  return `<nav class="bottom-tabs" aria-label="メインメニュー">
    ${tabs.map(t => `<button type="button" data-tab="${t.id}" class="${state.tab === t.id ? 'active' : ''}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${t.icon}<span>${t.label}</span></button>`).join('')}
  </nav>`;
}

function render() {
  if (state.appPhase === 'splash') return;
  if (state.appPhase === 'select_time') {
    app.innerHTML = courseSelectView() + noticeMarkup(false);
    wireCourseSelect();
    return;
  }
  const plan = currentPlan();
  const hasMini = Boolean(miniPlayerContext());
  const body = state.tab === 'plan'
    ? planTabView(hasMini)
    : state.tab === 'audio'
      ? audioTabView(hasMini)
      : state.tab === 'settings'
        ? settingsTabView(hasMini)
        : mapTabView(hasMini);

  app.innerHTML = `
    <header class="main-header">
      <div class="header-brand">
        <img class="header-app-icon" src="${iconUrl}" alt="">
        <b>${esc(APP_NAME)}</b>
        <span class="header-course-tag">${esc(plan.label)}</span>
        ${state.offline ? '<span class="offline-pill" role="status">オフライン</span>' : ''}
      </div>
      <div class="header-actions">
        <button type="button" class="header-course-btn" data-change-course>コース変更</button>
        <button type="button" class="header-audio-btn" data-open-audio-settings aria-label="オーディオ設定" title="オーディオ設定（速度調整）">⚙</button>
      </div>
    </header>
    ${body}
    ${miniPlayerMarkup()}
    ${bottomTabsMarkup()}
    ${workDetailSheetMarkup()}
    ${audioSettingsModalMarkup()}
    ${noticeMarkup(hasMini)}
  `;
  wireMain();
  syncSeekBars();
}

function wireCourseSelect() {
  const syncCountUI = rawValue => {
    const bounds = timeCourseBounds(state.draftMinutes || 90, maxRoutableCount);
    const parsed = Math.round(Number(rawValue));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(bounds.min, Math.min(bounds.max, parsed));
    state.draftCount = clamped;
    const pace = paceSummaryFor(bounds.minutes, clamped, bounds);
    const slider = document.querySelector('[data-count-slider]');
    const numInput = document.querySelector('[data-count-input]');
    const badge = document.querySelector('[data-pace-badge]');
    const detail = document.querySelector('[data-pace-detail]');
    const ctaCount = document.querySelector('[data-cta-count]');
    if (slider && slider.value !== String(clamped)) slider.value = String(clamped);
    if (numInput && document.activeElement !== numInput) numInput.value = String(clamped);
    if (badge) {
      badge.textContent = pace.label;
      badge.className = `pace-badge pace-${pace.key}`;
    }
    if (detail) detail.textContent = pace.detail;
    if (ctaCount) ctaCount.textContent = String(clamped);
  };

  document.querySelectorAll('[data-pick-minutes]').forEach(btn => {
    btn.onclick = () => {
      const m = Number(btn.dataset.pickMinutes);
      const bounds = timeCourseBounds(m, maxRoutableCount);
      state.draftMinutes = bounds.minutes;
      state.draftCount = bounds.recommended;
      render();
    };
  });
  document.querySelector('[data-count-slider]')?.addEventListener('input', event => {
    syncCountUI(event.target.value);
    const numInput = document.querySelector('[data-count-input]');
    if (numInput) numInput.value = String(state.draftCount);
  });
  const countInput = document.querySelector('[data-count-input]');
  countInput?.addEventListener('input', event => {
    if (event.target.value === '') return;
    syncCountUI(event.target.value);
  });
  countInput?.addEventListener('change', event => {
    syncCountUI(event.target.value);
    event.target.value = String(state.draftCount);
  });
  document.querySelector('[data-set-recommended]')?.addEventListener('click', event => {
    const rec = Number(event.currentTarget.dataset.setRecommended);
    syncCountUI(rec);
    const numInput = document.querySelector('[data-count-input]');
    if (numInput) numInput.value = String(state.draftCount);
  });
  document.querySelector('[data-start-timed-route]')?.addEventListener('click', () => {
    chooseTimedCourse(state.draftMinutes || 90, state.draftCount, {goMap: true});
  });
  document.querySelectorAll('[data-course-id]').forEach(btn => {
    btn.onclick = () => choosePresetCourse(btn.dataset.courseId, {goMap: true});
  });
  document.querySelectorAll('[data-prefer-elevator]').forEach(btn => {
    btn.onclick = () => setPreferElevator(btn.dataset.preferElevator === 'true');
  });
  document.querySelector('[data-choose-myplan]')?.addEventListener('click', () => chooseMyPlan({goMap: false}));
  document.querySelector('[data-cancel-course]')?.addEventListener('click', () => {
    state.appPhase = 'main';
    render();
  });
}

function wireAudioRows() {
  document.querySelectorAll('[data-audio-play]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.audioPlay;
      const select = document.querySelector(`[data-audio-length="${id}"]`);
      const length = select ? Number(select.value) : preferredLengthFor(byId[id]);
      toggleAudio(id, length);
    };
  });
  document.querySelectorAll('[data-audio-length]').forEach(select => {
    select.onchange = () => {
      const id = select.dataset.audioLength;
      state.audioDurations[id] = Number(select.value);
      refreshAudioList();
    };
  });
  document.querySelectorAll('[data-audio-download]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.audioDownload;
      const select = document.querySelector(`[data-audio-length="${id}"]`);
      const length = select ? Number(select.value) : preferredLengthFor(byId[id]);
      saveAudioButton(btn, id, length);
    };
  });
  document.querySelectorAll('.audio-list [data-toggle-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      handleToggleMyPlan(btn.dataset.toggleMyplan);
    };
  });
  document.querySelectorAll('.audio-list [data-open-detail]').forEach(el => {
    const open = () => openWorkDetail(el.dataset.openDetail);
    el.onclick = open;
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
  });
  document.querySelector('[data-reset-audio-filter]')?.addEventListener('click', () => {
    state.audioQuery = '';
    state.audioFilter = 'all';
    render();
  });
}

function refreshAudioList() {
  const visible = visibleAudioWorks();
  const list = document.querySelector('.audio-list');
  const count = document.querySelector('.audio-count');
  const clearBtn = document.querySelector('[data-clear-search]');
  if (list) list.innerHTML = audioRowsMarkup(visible);
  if (count) count.textContent = `${visible.length} / ${works.length}作品`;
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.audioQuery);
  wireAudioRows();
}

function wireMain() {
  document.querySelector('[data-change-course]')?.addEventListener('click', () => {
    const plan = currentPlan();
    if (!plan.isCustom && plan.kind === 'time') {
      const bounds = timeCourseBounds(plan.minutes || state.minutes, maxRoutableCount);
      state.draftMinutes = bounds.minutes;
      state.draftCount = Math.max(bounds.min, Math.min(bounds.max, plan.ids.length || bounds.recommended));
    }
    state.detailWorkId = null;
    state.audioSettingsOpen = false;
    state.appPhase = 'select_time';
    render();
    window.scrollTo({top: 0});
  });

  document.querySelectorAll('[data-open-audio-settings]').forEach(btn => {
    btn.onclick = () => {
      state.audioSettingsOpen = true;
      render();
    };
  });
  document.querySelectorAll('[data-close-audio-settings]').forEach(el => {
    el.onclick = () => {
      state.audioSettingsOpen = false;
      render();
    };
  });
  document.querySelector('[data-rate-slider]')?.addEventListener('input', event => {
    setPlaybackRate(Number(event.target.value), {rerender: false});
  });
  document.querySelectorAll('[data-toggle-autoplay]').forEach(btn => {
    btn.onclick = () => {
      state.autoPlayNext = !state.autoPlayNext;
      persistState();
      render();
    };
  });
  document.querySelectorAll('[data-set-large-text]').forEach(btn => {
    btn.onclick = () => {
      state.largeText = btn.dataset.setLargeText === 'true';
      persistState();
      render();
    };
  });
  document.querySelectorAll('[data-prefer-elevator]').forEach(btn => {
    btn.onclick = () => setPreferElevator(btn.dataset.preferElevator === 'true');
  });
  document.querySelectorAll('[data-facility-filter]').forEach(btn => {
    btn.onclick = () => {
      state.facilityFilter = btn.dataset.facilityFilter;
      render();
    };
  });

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      state.detailWorkId = null;
      state.audioSettingsOpen = false;
      persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });
  document.querySelectorAll('[data-open-plan]').forEach(btn => {
    btn.onclick = () => {
      state.tab = 'plan';
      state.detailWorkId = null;
      persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });

  document.querySelectorAll('[data-floor]').forEach(btn => {
    btn.onclick = () => {
      state.floor = Number(btn.dataset.floor);
      persistState();
      render();
    };
  });
  document.querySelectorAll('[data-jump-floor]').forEach(btn => {
    btn.onclick = () => {
      state.floor = Number(btn.dataset.jumpFloor);
      persistState();
      render();
    };
  });

  const supportDetails = document.querySelector('.movement-support');
  if (supportDetails) supportDetails.ontoggle = () => { state.support.open = supportDetails.open; };
  document.querySelectorAll('[data-edit-location]').forEach(btn => {
    btn.onclick = () => {
      state.support.open = true;
      state.support.editing = true;
      state.support.error = '';
      render();
      document.querySelector('#room-number')?.focus();
    };
  });
  document.querySelectorAll('[data-room-search]').forEach(form => {
    form.onsubmit = event => {
      event.preventDefault();
      lookupRoom(new FormData(form).get('room'));
    };
  });
  document.querySelectorAll('[name="room-candidate"]').forEach(input => {
    input.onchange = () => {
      state.support.selectedCandidateId = input.value;
      state.support.error = '';
      document.querySelector('.room-error')?.remove();
    };
  });
  document.querySelectorAll('[data-confirm-location]').forEach(btn => {
    btn.onclick = confirmLocationCorrection;
  });

  document.querySelectorAll('[data-switch-preset]').forEach(btn => {
    btn.onclick = () => choosePresetCourse(btn.dataset.switchPreset, {goMap: false});
  });
  document.querySelector('[data-switch-myplan]')?.addEventListener('click', () => chooseMyPlan({goMap: false}));
  document.querySelector('[data-optimize-myplan]')?.addEventListener('click', handleOptimizeMyPlan);
  document.querySelectorAll('[data-go-audio-mapped]').forEach(btn => {
    btn.onclick = () => {
      state.tab = 'audio';
      state.audioFilter = 'mapped';
      persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });
  document.querySelectorAll('[data-bulk-download]').forEach(btn => {
    btn.onclick = downloadCurrentPlanAudio;
  });
  document.querySelectorAll('[data-quick-play]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.quickPlay;
      toggleAudio(id, preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-show-map]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.showMap;
      clearProgressNotice();
      selectRouteWork(id, {focusFloor: true});
      state.detailWorkId = null;
      state.tab = 'map';
      persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });
  document.querySelectorAll('[data-toggle-viewed]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      toggleViewed(btn.dataset.toggleViewed);
    };
  });
  document.querySelectorAll('[data-toggle-myplan]').forEach(btn => {
    if (btn.closest('.audio-list')) return;
    btn.onclick = event => {
      event.stopPropagation();
      handleToggleMyPlan(btn.dataset.toggleMyplan);
    };
  });
  document.querySelectorAll('[data-move-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      handleMoveMyPlan(btn.dataset.moveMyplan, Number(btn.dataset.delta));
    };
  });
  document.querySelectorAll('[data-remove-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      handleRemoveMyPlan(btn.dataset.removeMyplan);
    };
  });

  document.querySelectorAll('[data-open-detail]').forEach(el => {
    if (el.closest('.audio-list')) return;
    const open = () => { if (el.dataset.openDetail) openWorkDetail(el.dataset.openDetail); };
    el.onclick = open;
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
  });

  document.querySelectorAll('[data-close-detail]').forEach(el => {
    el.onclick = closeWorkDetail;
  });
  document.querySelectorAll('[data-switch-detail]').forEach(btn => {
    btn.onclick = () => {
      state.detailWorkId = btn.dataset.switchDetail;
      render();
    };
  });
  document.querySelectorAll('[data-detail-duration]').forEach(btn => {
    btn.onclick = () => {
      const workId = btn.dataset.detailWork;
      const length = Number(btn.dataset.detailDuration);
      state.duration = length;
      state.audioDurations[workId] = length;
      persistState();
      if (state.playing === workId) toggleAudio(workId, length);
      else render();
    };
  });
  document.querySelectorAll('[data-detail-play]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.detailPlay;
      toggleAudio(id, preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-detail-download]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.detailDownload;
      saveAudioButton(btn, id, preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-plan-step]').forEach(btn => {
    btn.onclick = () => {
      const nextIndex = Number(btn.dataset.planStep);
      const ids = currentPlan().ids;
      if (nextIndex < 0 || nextIndex >= ids.length) return;
      const nextId = ids[nextIndex];
      selectRouteWork(nextId, {focusFloor: false});
      state.detailWorkId = nextId;
      state.detailRoomWorks = [];
      render();
    };
  });

  document.querySelectorAll('[data-mini-play]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.miniPlay;
      toggleAudio(id, preferredLengthFor(byId[id]));
    };
  });
  document.querySelector('[data-mini-prev]')?.addEventListener('click', () => stepMiniPlayer(-1));
  document.querySelector('[data-mini-next]')?.addEventListener('click', () => stepMiniPlayer(1));
  document.querySelector('[data-mini-close]')?.addEventListener('click', closeMiniPlayer);
  document.querySelectorAll('[data-seek-delta]').forEach(btn => {
    btn.onclick = () => seekBy(Number(btn.dataset.seekDelta));
  });
  document.querySelectorAll('[data-seek]').forEach(input => {
    input.addEventListener('input', event => {
      const workId = input.dataset.seekWork;
      if (workId && state.player.workId !== workId) return;
      if (Number.isFinite(player.duration) && player.duration > 0) {
        player.currentTime = player.duration * (Number(event.target.value) / 1000);
        syncSeekBars();
      }
    });
  });

  document.querySelector('[data-audio-search]')?.addEventListener('input', event => {
    state.audioQuery = event.target.value;
    refreshAudioList();
  });
  document.querySelector('[data-clear-search]')?.addEventListener('click', () => {
    state.audioQuery = '';
    const input = document.querySelector('[data-audio-search]');
    if (input) { input.value = ''; input.focus(); }
    refreshAudioList();
  });
  document.querySelector('[data-audio-sort]')?.addEventListener('change', event => {
    state.audioSort = event.target.value;
    refreshAudioList();
  });
  document.querySelectorAll('[data-audio-filter]').forEach(btn => {
    btn.onclick = () => {
      state.audioFilter = btn.dataset.audioFilter;
      render();
    };
  });
  wireAudioRows();

  document.querySelectorAll('[data-set-rate]').forEach(btn => {
    btn.onclick = () => setPlaybackRate(Number(btn.dataset.setRate));
  });
  document.querySelectorAll('[data-default-duration]').forEach(btn => {
    btn.onclick = () => {
      state.duration = Number(btn.dataset.defaultDuration);
      persistState();
      render();
    };
  });
  document.querySelector('[data-clear-cache]')?.addEventListener('click', clearAudioCache);
  document.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
    if (!window.confirm('鑑賞済みチェックと現在地を初期状態に戻しますか？（マイプランはそのまま残ります）')) return;
    clearProgressNotice();
    state.viewed.clear();
    state.navigation = navigationStateFromRoute(navigationIndex, routableIds());
    state.selected = currentPlan().ids[0] ?? null;
    persistState();
    setNotice('鑑賞の進捗を最初に戻しました', false, 3500);
    render();
  });

  document.querySelectorAll('[data-undo-arrival]').forEach(btn => {
    btn.onclick = undoArrival;
  });

  wireFloorMap({
    onWorkSelect: (id, roomWorkIds) => {
      openWorkDetail(id, roomWorkIds);
    }
  });
}

async function loadDownloads() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const requests = await cache.keys();
    const cachedUrls = new Set(requests.map(req => req.url));
    for (const work of works) {
      for (const length of audioLengthsFor(work)) {
        if (cachedUrls.has(audioPath(work.id, length))) {
          state.downloaded.add(`${work.id}-${length}`);
        }
      }
    }
  } catch { /* offline cache optional */ }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', appBase)).catch(() => {});
}

window.addEventListener('online', () => { state.offline = false; render(); });
window.addEventListener('offline', () => { state.offline = true; render(); });

player.addEventListener('timeupdate', syncSeekBars);
player.addEventListener('loadedmetadata', syncSeekBars);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (state.audioSettingsOpen) { state.audioSettingsOpen = false; render(); }
    else if (state.detailWorkId) closeWorkDetail();
  }
});

const downloadsPromise = loadDownloads();

if (!skipSplashImmediate) {
  const skipEl = document.querySelector('[data-skip-splash]');
  const finishSplash = () => {
    if (splashSkipped) return;
    splashSkipped = true;
    document.querySelector('.splash')?.classList.add('leaving');
    setTimeout(() => {
      state.appPhase = state.hasChosenCourse ? 'main' : 'select_time';
      render();
    }, 460);
  };
  skipEl?.addEventListener('click', finishSplash);
  skipEl?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finishSplash(); }
  });
  await Promise.all([
    downloadsPromise,
    new Promise(resolve => setTimeout(resolve, Math.max(0, 2700 - (performance.now() - bootStarted))))
  ]);
  finishSplash();
} else {
  await downloadsPromise;
  state.appPhase = state.hasChosenCourse ? 'main' : 'select_time';
  render();
}
