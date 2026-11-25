import {paceSummaryFor, timeCourseBounds} from '../my-plan.js';
import {SUPPORTED_LANGS, localizeRoute, t} from '../i18n.js';
import {esc} from '../app/ui-helpers.js';

export function languageSelectView(ctx) {
  const lang = ctx.state.lang;
  const tr = key => t(key, null, lang);
  const ordered = ['en', 'fr', 'ja', ...SUPPORTED_LANGS.map(item => item.code).filter(code => !['en', 'fr', 'ja'].includes(code))]
    .map(code => SUPPORTED_LANGS.find(item => item.code === code));

  return `<main class="course-screen language-screen">
    <h1>${esc(tr('app.splashLangLabel'))}</h1>
    <div class="home-language-list" role="group" aria-label="${esc(tr('app.splashLangLabel'))}">
      ${ordered.map(item => `<button type="button" class="home-language-option ${lang === item.code ? 'active' : ''}" data-set-lang="${item.code}" aria-pressed="${lang === item.code}">${esc(item.label)}</button>`).join('')}
    </div>
    <button type="button" class="primary language-next-btn" data-language-next>${esc(tr('language.next'))}</button>
  </main>`;
}

export function courseSelectView(ctx) {
  const {routes, state, maxRoutableCount, works} = ctx;
  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  const timeRoutes = routes.filter(item => item.kind !== 'theme');
  const themeRoutes = routes.filter(item => item.kind === 'theme').map(item => localizeRoute(item, lang));
  const returnButton = state.courseEntry === 'main'
    ? `<button class="text-back-btn" type="button" data-cancel-course>${esc(tr('course.backBtn'))}</button>`
    : `<button class="text-back-btn" type="button" data-back-language>← ${esc(tr('app.splashLangLabel'))}</button>`;
  const isThemeActive = state.hasChosenCourse && state.planMode === 'preset' && themeRoutes.some(r => r.id === state.routeId);
  const selectedMinutes = state.draftMinutes || 90;
  const bounds = timeCourseBounds(selectedMinutes, maxRoutableCount);
  const selectedCount = Math.max(bounds.min, Math.min(bounds.max, Math.round(state.draftCount || bounds.recommended)));
  const pace = paceSummaryFor(bounds.minutes, selectedCount, bounds, lang);
  const recPct = bounds.max > bounds.min
    ? Math.round(((bounds.recommended - bounds.min) / (bounds.max - bounds.min)) * 100)
    : 50;

  return `<main class="course-screen">
    ${returnButton}
    <h1>${esc(tr('course.title'))}</h1>

    <section class="step-block" aria-label="${esc(tr('course.step1Aria'))}">
      <div class="step-head"><span class="step-num">STEP 1</span><strong>${esc(tr('course.step1Title'))}</strong></div>
      <div class="time-pick-grid">
        ${timeRoutes.map(item => {
          const isPicked = selectedMinutes === item.minutes;
          return `<button class="time-pick-card ${isPicked ? 'active' : ''}" type="button" data-pick-minutes="${item.minutes}" aria-pressed="${isPicked}">
            <strong>${item.minutes}<small>${esc(tr('course.minUnit'))}</small></strong>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="step-block" aria-label="${esc(tr('course.step2Aria'))}">
      <div class="step-head"><span class="step-num">STEP 2</span><strong>${esc(tr('course.step2Title', {minutes: bounds.minutes}))}</strong></div>
      <div class="count-picker-card">
        <div class="count-controls-row">
          <div class="count-slider-col">
            <input class="count-slider" type="range" min="${bounds.min}" max="${bounds.max}" step="1" value="${selectedCount}" data-count-slider aria-label="${esc(tr('course.sliderAria'))}">
            <div class="count-slider-marks" aria-hidden="true">
              <span>${esc(tr('course.sliderMin', {count: bounds.min}))}</span>
              <span class="rec-mark" style="left:${recPct}%">${esc(tr('course.sliderRec', {count: bounds.recommended}))}</span>
              <span>${esc(tr('course.sliderMax', {count: bounds.max}))}</span>
            </div>
          </div>
          <label class="count-number-box">
            <input type="number" min="${bounds.min}" max="${bounds.max}" inputmode="numeric" value="${selectedCount}" data-count-input aria-label="${esc(tr('course.numberAria'))}">
            <span>${esc(tr('course.worksUnit'))}</span>
          </label>
        </div>
        <p class="count-pace-detail" data-pace-detail>${esc(pace.detail)}</p>

        <div class="route-pref-bar route-pref-inline" role="group" aria-label="${esc(tr('course.routePrefAria'))}">
          <span class="route-pref-label">${esc(tr('course.routePrefLabel'))}</span>
          <div class="route-pref-toggle">
            <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">${esc(tr('course.shortest'))}</button>
            <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">${esc(tr('course.elevator'))}</button>
          </div>
        </div>

        <button type="button" class="primary start-timed-route-btn" data-start-timed-route>
          ${esc(tr('course.startCtaPrefix', {minutes: bounds.minutes}))}<span data-cta-count>${selectedCount}</span>${esc(tr('course.startCtaSuffix'))}
        </button>
      </div>
    </section>

    ${themeRoutes.length ? `<details class="theme-courses-disclosure" ${isThemeActive ? 'open' : ''}>
      <summary>
        <span>${esc(tr('course.themeSummary', {count: themeRoutes.length}))}</span>
        <small>${esc(tr('course.themeSub'))}</small>
      </summary>
      <div class="theme-course-list">
        ${themeRoutes.map(item => {
          const isCurrent = state.hasChosenCourse && state.planMode === 'preset' && state.routeId === item.id;
          return `<button class="theme-course-card ${isCurrent ? 'active' : ''}" type="button" data-course-id="${esc(item.id)}">
            <div>
              <strong>${esc(item.label)}</strong>
              <small>${esc(item.subtitle)}</small>
            </div>
            <span class="course-badge">${esc(tr('course.approxMin', {minutes: item.minutes}))}</span>
          </button>`;
        }).join('')}
      </div>
    </details>` : ''}
    <button class="course-custom-card ${state.hasChosenCourse && state.planMode === 'myplan' ? 'active' : ''}" type="button" data-choose-myplan>
      <div>
        <span class="eyebrow">${esc(tr('course.customEyebrow'))}</span>
        <strong>${esc(tr('course.myPlanTitle'))}</strong>
        <p>${esc(state.myPlanIds.length ? tr('course.myPlanHasItems', {count: state.myPlanIds.length}) : tr('course.myPlanEmpty', {total: works.length}))}</p>
      </div>
      <span class="arrow" aria-hidden="true">›</span>
    </button>
  </main>`;
}

export function wireCourseSelect(ctx) {
  const {state, maxRoutableCount, planActions} = ctx;
  const syncCountUI = rawValue => {
    const bounds = timeCourseBounds(state.draftMinutes || 90, maxRoutableCount);
    const parsed = Math.round(Number(rawValue));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(bounds.min, Math.min(bounds.max, parsed));
    state.draftCount = clamped;
    const pace = paceSummaryFor(bounds.minutes, clamped, bounds, state.lang);
    const slider = document.querySelector('[data-count-slider]');
    const numInput = document.querySelector('[data-count-input]');
    const detail = document.querySelector('[data-pace-detail]');
    const ctaCount = document.querySelector('[data-cta-count]');
    if (slider && slider.value !== String(clamped)) slider.value = String(clamped);
    if (numInput && document.activeElement !== numInput) numInput.value = String(clamped);
    if (detail) detail.textContent = pace.detail;
    if (ctaCount) ctaCount.textContent = String(clamped);
  };

  document.querySelectorAll('[data-pick-minutes]').forEach(btn => {
    btn.onclick = () => {
      const m = Number(btn.dataset.pickMinutes);
      const bounds = timeCourseBounds(m, maxRoutableCount);
      state.draftMinutes = bounds.minutes;
      state.draftCount = bounds.recommended;
      ctx.render();
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
  document.querySelector('[data-start-timed-route]')?.addEventListener('click', () => {
    planActions.chooseTimedCourse(state.draftMinutes || 90, state.draftCount, {goMap: true});
  });
  document.querySelectorAll('[data-course-id]').forEach(btn => {
    btn.onclick = () => planActions.choosePresetCourse(btn.dataset.courseId, {goMap: true});
  });
  document.querySelectorAll('[data-prefer-elevator]').forEach(btn => {
    btn.onclick = () => planActions.setPreferElevator(btn.dataset.preferElevator === 'true');
  });
  document.querySelector('[data-choose-myplan]')?.addEventListener('click', () => planActions.chooseMyPlan({goMap: false}));
  document.querySelector('[data-cancel-course]')?.addEventListener('click', () => {
    state.appPhase = 'main';
    ctx.render();
  });
  document.querySelector('[data-back-language]')?.addEventListener('click', () => {
    state.appPhase = 'select_language';
    ctx.render();
  });
}
