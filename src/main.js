import {APP_NAME} from './app-config.js';
import {SUPPORTED_LANGS, detectBrowserLang, ensureWorkLocale, getLangMeta, normalizeLang, setLang, t} from './i18n.js';
import {indexNavigationGraph} from './navigation.js';
import {timeCourseBounds} from './my-plan.js';
import {createAppStore, readPersistedState} from './app/state.js';
import {bottomTabsMarkup, createNoticeController, esc, noticeMarkup} from './app/ui-helpers.js';
import {createAudioController} from './app/audio-controller.js';
import {createPlanActions} from './app/plan-actions.js';
import {courseSelectView, wireCourseSelect} from './views/course-select.js';
import {mapTabView, wireMapTab} from './views/map-tab.js';
import {planTabView, wirePlanTab} from './views/plan-tab.js';
import {audioTabView, visibleAudioWorks, wireAudioTab} from './views/audio-tab.js';
import {settingsTabView, wireSettingsTab} from './views/settings-tab.js';
import {closeWorkDetail, openWorkDetail, workDetailSheetMarkup, wireWorkDetailSheet} from './views/work-detail-sheet.js';
import {audioSettingsModalMarkup, miniPlayerMarkup, wireAudioSettingsModal, wireMiniPlayer} from './views/mini-player.js';

const bootStarted = performance.now();
const persistedBoot = readPersistedState();
const hasConfirmedLang = Boolean(persistedBoot?.hasChosenLang);
const bootLang = setLang(persistedBoot?.lang ? normalizeLang(persistedBoot.lang) : detectBrowserLang());
const skipSplashImmediate = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

document.title = APP_NAME;
const app = document.querySelector('#app');
const appBase = new URL('../', import.meta.url);
const iconUrl = new URL('icons/icon-192.png', appBase).href;
const monaUrl = new URL('images/mona.jpg', appBase).href;

let splashLang = bootLang;
let splashNeedsConfirm = !hasConfirmedLang;
let splashReady = false;
let splashStartRequested = false;
let splashSkipped = false;
let finishSplashImpl = null;
let onSplashLangSelected = null;

function requestSplashFinish() {
  if (splashSkipped) return;
  splashStartRequested = true;
  if (splashReady && finishSplashImpl) {
    void finishSplashImpl();
    return;
  }
  const startBtn = document.querySelector('[data-splash-start]');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = t('app.loading', null, splashLang);
  }
}

function applySplashLanguage(nextLang) {
  const applied = setLang(nextLang);
  splashLang = applied;
  splashNeedsConfirm = true;
  void ensureWorkLocale(applied, appBase);
  onSplashLangSelected?.(applied);

  const splashEl = document.querySelector('[data-skip-splash]');
  if (splashEl) {
    splashEl.classList.add('is-confirm-mode');
    splashEl.removeAttribute('role');
    splashEl.removeAttribute('tabindex');
    splashEl.removeAttribute('aria-label');
  }
  const subtitleEl = document.querySelector('[data-splash-subtitle]');
  if (subtitleEl) subtitleEl.textContent = t('app.brandSubtitle', null, applied);
  const taglineEl = document.querySelector('[data-splash-tagline]');
  if (taglineEl) taglineEl.textContent = t('app.tagline', null, applied);
  const langLabelEl = document.querySelector('[data-splash-lang-label]');
  if (langLabelEl) langLabelEl.textContent = t('app.splashLangLabel', null, applied);
  const langGroupEl = document.querySelector('[data-splash-lang-group]');
  if (langGroupEl) langGroupEl.setAttribute('aria-label', t('app.splashLangLabel', null, applied));
  const startBtn = document.querySelector('[data-splash-start]');
  if (startBtn) {
    startBtn.hidden = false;
    startBtn.textContent = splashStartRequested && !splashReady
      ? t('app.loading', null, applied)
      : t('app.splashStart', null, applied);
  }
  const hintEl = document.querySelector('[data-splash-hint]');
  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = t('app.splashHint', null, applied);
  }
  document.querySelectorAll('[data-splash-lang]').forEach(btn => {
    const active = btn.dataset.splashLang === applied;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

if (!skipSplashImmediate) {
  const skipAttrs = splashNeedsConfirm
    ? ''
    : `role="button" tabindex="0" aria-label="${esc(t('app.skipSplashAria', null, bootLang))}"`;
  app.innerHTML = `<div class="splash ${splashNeedsConfirm ? 'is-confirm-mode' : ''}" data-skip-splash ${skipAttrs}><div class="gallery-arches" aria-hidden="true"></div><div class="splash-stage"><figure class="splash-mona-frame"><div class="splash-mona-mat"><img class="splash-mona-img" src="${monaUrl}" alt="Mona Lisa"></div><figcaption>La Joconde · Salle 711</figcaption></figure><div class="splash-brand-line"><img class="splash-icon" src="${iconUrl}" alt="${APP_NAME}"><span data-splash-subtitle>${esc(t('app.brandSubtitle', null, bootLang))}</span></div><h1>${APP_NAME}</h1><p data-splash-tagline>${esc(t('app.tagline', null, bootLang))}</p><div class="splash-lang-wrap" data-splash-controls><span class="splash-lang-label" data-splash-lang-label>${esc(t('app.splashLangLabel', null, bootLang))}</span><div class="splash-lang-pills" role="group" aria-label="${esc(t('app.splashLangLabel', null, bootLang))}" data-splash-lang-group>${SUPPORTED_LANGS.map(item => `<button type="button" class="splash-lang-pill ${bootLang === item.code ? 'active' : ''}" data-splash-lang="${item.code}" aria-pressed="${bootLang === item.code}">${esc(item.label)}</button>`).join('')}</div></div><div class="splash-action-slot" data-splash-controls><button type="button" class="splash-start-btn" data-splash-start ${splashNeedsConfirm ? '' : 'hidden'}>${esc(t('app.splashStart', null, bootLang))}</button><span class="splash-hint" data-splash-hint ${splashNeedsConfirm ? 'hidden' : ''}>${esc(t('app.splashHint', null, bootLang))}</span></div></div></div>`;

  const skipEl = document.querySelector('[data-skip-splash]');
  document.querySelectorAll('[data-splash-lang]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      const next = btn.dataset.splashLang;
      if (next) applySplashLanguage(next);
    });
  });
  document.querySelector('[data-splash-start]')?.addEventListener('click', event => {
    event.stopPropagation();
    requestSplashFinish();
  });
  skipEl?.addEventListener('click', event => {
    if (event.target.closest('[data-splash-controls]')) return;
    if (splashNeedsConfirm) return;
    requestSplashFinish();
  });
  skipEl?.addEventListener('keydown', event => {
    if (event.target.closest('[data-splash-controls]')) return;
    if (splashNeedsConfirm) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestSplashFinish(); }
  });
} else {
  app.innerHTML = `<div class="boot-loading"><p>${esc(t('app.loading', null, bootLang))}</p></div>`;
}

const [[works, routes, sources, navigationGraph, artworkImages, imageCredits]] = await Promise.all([
  Promise.all([
    'works.json',
    'routes.json',
    'provenance.json',
    'navigation-graph.json',
    'artwork-images.json',
    'image-credits.json'
  ].map(async name => {
    const response = await fetch(new URL(name, import.meta.url));
    if (!response.ok) throw new Error(`Failed to load ${name}`);
    return response.json();
  })),
  ensureWorkLocale(bootLang, appBase)
]).catch(error => {
  app.innerHTML = `<main class="error-screen"><h1>${esc(t('app.errorTitle', null, bootLang))}</h1><p>${esc(t('app.errorBody', null, bootLang))}</p><button class="primary" onclick="location.reload()">${esc(t('app.reload', null, bootLang))}</button></main>`;
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

const store = createAppStore({
  works,
  routes,
  byId,
  worksByFloorRoom,
  navigationIndex,
  persistedBoot,
  skipSplashImmediate,
  appBase
});

const notices = createNoticeController(store.state);

const ctx = {
  app,
  appBase,
  iconUrl,
  monaUrl,
  works,
  routes,
  sources,
  navigationGraph,
  artworkImages,
  imageCredits,
  byId,
  worksByFloorRoom,
  navigationIndex,
  ...store,
  ...notices,
  visibleAudioWorks: () => visibleAudioWorks(ctx),
  openWorkDetail: (workId, roomWorkIds) => openWorkDetail(ctx, workId, roomWorkIds),
  closeWorkDetail: () => closeWorkDetail(ctx),
  render
};

ctx.audio = createAudioController(ctx);
ctx.planActions = createPlanActions(ctx);

function wireShell() {
  const {state, maxRoutableCount, planActions, audio} = ctx;

  document.querySelector('[data-change-course]')?.addEventListener('click', () => {
    const plan = ctx.currentPlan();
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

  document.querySelectorAll('[data-prefer-elevator]').forEach(btn => {
    btn.onclick = () => planActions.setPreferElevator(btn.dataset.preferElevator === 'true');
  });

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      state.detailWorkId = null;
      state.audioSettingsOpen = false;
      ctx.persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });

  document.querySelectorAll('[data-go-audio-mapped]').forEach(btn => {
    btn.onclick = () => {
      state.tab = 'audio';
      state.audioFilter = 'mapped';
      ctx.persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });

  document.querySelectorAll('[data-bulk-download]').forEach(btn => {
    btn.onclick = audio.downloadCurrentPlanAudio;
  });

  document.querySelectorAll('[data-show-map]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.showMap;
      ctx.clearProgressNotice();
      planActions.selectRouteWork(id, {focusFloor: true});
      state.detailWorkId = null;
      state.tab = 'map';
      ctx.persistState();
      render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });

  document.querySelectorAll('[data-toggle-viewed]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      planActions.toggleViewed(btn.dataset.toggleViewed);
    };
  });

  document.querySelectorAll('[data-toggle-myplan]').forEach(btn => {
    if (btn.closest('.audio-list')) return;
    btn.onclick = event => {
      event.stopPropagation();
      planActions.handleToggleMyPlan(btn.dataset.toggleMyplan);
    };
  });

  document.querySelectorAll('[data-open-detail]').forEach(el => {
    if (el.closest('.audio-list')) return;
    const open = () => { if (el.dataset.openDetail) openWorkDetail(ctx, el.dataset.openDetail); };
    el.onclick = open;
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
  });

  document.querySelectorAll('[data-undo-arrival]').forEach(btn => {
    btn.onclick = planActions.undoArrival;
  });

  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.onclick = async () => {
      const next = btn.dataset.setLang;
      if (!next || next === state.lang) return;
      const applied = ctx.setAppLang(next);
      const meta = getLangMeta(applied);
      ctx.setNotice(t('app.languageSwitched', {label: meta.label}, applied), false, 2800);
      render();
      if (await ensureWorkLocale(applied, appBase)) render();
    };
  });
}

function wireMain() {
  wireShell();
  wireAudioSettingsModal(ctx);
  wireMapTab(ctx);
  wirePlanTab(ctx);
  wireWorkDetailSheet(ctx);
  wireMiniPlayer(ctx);
  wireAudioTab(ctx);
  wireSettingsTab(ctx);
}

function render() {
  const {state} = ctx;
  const lang = state.lang;
  if (state.appPhase === 'splash') return;
  if (state.appPhase === 'select_time') {
    app.innerHTML = courseSelectView(ctx) + noticeMarkup(ctx, false);
    wireCourseSelect(ctx);
    document.querySelectorAll('[data-set-lang]').forEach(btn => {
      btn.onclick = async () => {
        const next = btn.dataset.setLang;
        if (!next || next === state.lang) return;
        const applied = ctx.setAppLang(next);
        const meta = getLangMeta(applied);
        ctx.setNotice(t('app.languageSwitched', {label: meta.label}, applied), false, 2800);
        render();
        if (await ensureWorkLocale(applied, appBase)) render();
      };
    });
    return;
  }
  const plan = ctx.currentPlan();
  const hasMini = Boolean(ctx.audio.miniPlayerContext());
  const body = state.tab === 'plan'
    ? planTabView(ctx, hasMini)
    : state.tab === 'audio'
      ? audioTabView(ctx, hasMini)
      : state.tab === 'settings'
        ? settingsTabView(ctx, hasMini)
        : mapTabView(ctx, hasMini);

  app.innerHTML = `
    <header class="main-header">
      <div class="header-brand">
        <img class="header-app-icon" src="${iconUrl}" alt="">
        <b>${esc(APP_NAME)}</b>
        <span class="header-course-tag">${esc(plan.label)}</span>
        ${state.offline ? `<span class="offline-pill" role="status">${esc(t('app.offline', null, lang))}</span>` : ''}
      </div>
      <div class="header-actions">
        <button type="button" class="header-course-btn" data-change-course>${esc(t('app.changeCourse', null, lang))}</button>
        <button type="button" class="header-audio-btn" data-open-audio-settings aria-label="${esc(t('app.audioSettingsAria', null, lang))}" title="${esc(t('app.audioSettingsTitle', null, lang))}">⚙</button>
      </div>
    </header>
    ${body}
    ${miniPlayerMarkup(ctx)}
    ${bottomTabsMarkup(ctx)}
    ${workDetailSheetMarkup(ctx)}
    ${audioSettingsModalMarkup(ctx)}
    ${noticeMarkup(ctx, hasMini)}
  `;
  wireMain();
  ctx.audio.syncSeekBars();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', appBase)).catch(() => {});
}

window.addEventListener('online', () => { ctx.state.offline = false; render(); });
window.addEventListener('offline', () => { ctx.state.offline = true; render(); });

ctx.audio.player.addEventListener('timeupdate', ctx.audio.syncSeekBars);
ctx.audio.player.addEventListener('loadedmetadata', ctx.audio.syncSeekBars);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (ctx.state.audioSettingsOpen) { ctx.state.audioSettingsOpen = false; render(); }
    else if (ctx.state.detailWorkId) closeWorkDetail(ctx);
  }
});

const downloadsPromise = ctx.audio.loadDownloads();

if (!skipSplashImmediate) {
  onSplashLangSelected = applied => {
    ctx.setAppLang(applied, {confirm: false});
  };
  if (splashLang !== ctx.state.lang) ctx.setAppLang(splashLang, {confirm: false});

  finishSplashImpl = async () => {
    if (splashSkipped) return;
    splashSkipped = true;
    const startBtn = document.querySelector('[data-splash-start]');
    if (startBtn) startBtn.disabled = true;
    if (ctx.state.lang !== splashLang || !ctx.state.hasChosenLang) {
      ctx.setAppLang(splashLang, {confirm: true});
    }
    await ensureWorkLocale(splashLang, appBase);
    document.querySelector('.splash')?.classList.add('leaving');
    setTimeout(() => {
      ctx.state.appPhase = ctx.state.hasChosenCourse ? 'main' : 'select_time';
      render();
    }, 460);
  };

  await downloadsPromise;
  splashReady = true;

  if (splashStartRequested) {
    await finishSplashImpl();
  } else if (!splashNeedsConfirm) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 2800 - (performance.now() - bootStarted))));
    if (!splashNeedsConfirm && !splashSkipped) {
      await finishSplashImpl();
    }
  }
} else {
  await downloadsPromise;
  ctx.state.appPhase = ctx.state.hasChosenCourse ? 'main' : 'select_time';
  render();
}
