import {APP_NAME} from '../app-config.js';
import {paceSummaryFor, timeCourseBounds} from '../my-plan.js';
import {esc} from '../app/ui-helpers.js';

export function courseSelectView(ctx) {
  const {routes, state, iconUrl, maxRoutableCount} = ctx;
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

export function wireCourseSelect(ctx) {
  const {state, maxRoutableCount, planActions} = ctx;
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
  document.querySelector('[data-set-recommended]')?.addEventListener('click', event => {
    const rec = Number(event.currentTarget.dataset.setRecommended);
    syncCountUI(rec);
    const numInput = document.querySelector('[data-count-input]');
    if (numInput) numInput.value = String(state.draftCount);
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
}
