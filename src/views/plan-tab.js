import {destinationWorkId} from '../route-progress.js';
import {localizeRoute, localizeWork, t} from '../i18n.js';
import {creatorMeta, esc, priorityBadgeMarkup, thumbMarkup, workStatus} from '../app/ui-helpers.js';

export function planTabView(ctx, hasMini) {
  const {state, routes, works, navigationIndex} = ctx;
  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  const plan = ctx.currentPlan();
  const items = ctx.planWorks();
  const estimates = ctx.currentEstimates();
  const destId = destinationWorkId(navigationIndex, state.navigation);
  const viewedInPlan = items.filter(w => state.viewed.has(w.id)).length;
  const remainingCount = Math.max(0, items.length - viewedInPlan);
  const pct = items.length ? Math.round((viewedInPlan / items.length) * 100) : 0;
  const estRemainingMinutes = items.length > 0 && remainingCount > 0
    ? Math.max(5, Math.round((plan.estimatedMinutes * remainingCount) / items.length))
    : 0;
  const nextRawWork = (destId && !state.viewed.has(destId) ? items.find(w => w.id === destId) : null)
    || items.find(w => !state.viewed.has(w.id))
    || null;
  const nextWork = nextRawWork ? localizeWork(nextRawWork, lang) : null;
  const isAllDone = items.length > 0 && viewedInPlan === items.length;
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${ctx.preferredLengthFor(w)}`));
  const saveBtnText = state.bulkDownload.active
    ? tr('plan.savingBulk', {done: state.bulkDownload.done, total: state.bulkDownload.total})
    : allSaved
      ? tr('plan.allSaved')
      : tr('plan.saveCourseBtn', {count: items.length});

  return `<main class="tab-screen plan-screen ${hasMini ? 'has-mini-player' : ''}">
    <section class="plan-switcher" aria-label="${esc(tr('plan.switcherAria'))}">
      ${routes.map(raw => {
        const r = localizeRoute(raw, lang);
        return `<button type="button" class="pill-btn ${!plan.isCustom && plan.id === r.id ? 'active' : ''}" data-switch-preset="${esc(r.id)}">${esc(r.shortLabel)}</button>`;
      }).join('')}
      <button type="button" class="pill-btn ${plan.isCustom ? 'active' : ''}" data-switch-myplan>${esc(tr('plan.myPlanPill', {count: state.myPlanIds.length}))}</button>
    </section>

    <section class="plan-summary-card ${isAllDone ? 'is-complete' : ''}">
      <div class="plan-summary-top">
        <div>
          <span class="eyebrow">${esc(plan.isCustom ? tr('plan.eyebrowCustom') : plan.kind === 'theme' ? tr('plan.eyebrowTheme') : tr('plan.eyebrowRec'))}</span>
          <h1>${esc(plan.label)}</h1>
          ${plan.subtitle ? `<p class="plan-subtitle">${esc(plan.subtitle)}</p>` : ''}
        </div>
        ${items.length ? `<div class="plan-progress-ring ${isAllDone ? 'is-complete' : ''}">
          <strong>${pct}%</strong>
          <span>${esc(tr('plan.progressBadge', {viewed: viewedInPlan, total: items.length}))}</span>
        </div>` : `<div class="plan-progress-badge">${esc(tr('plan.progressBadge', {viewed: viewedInPlan, total: items.length}))}</div>`}
      </div>

      ${items.length ? `<div class="plan-progress-panel">
        <div class="progress-bar progress-bar-lg ${isAllDone ? 'is-complete' : ''}" aria-label="${esc(tr('plan.progressAria'))}">
          <span style="width:${pct}%"></span>
        </div>
        ${items.length <= 20 ? `<div class="progress-steps-track" aria-hidden="true">
          ${items.map(w => `<i class="${state.viewed.has(w.id) ? 'is-done' : w.id === destId ? 'is-next' : ''}"></i>`).join('')}
        </div>` : ''}
        <div class="plan-progress-foot">
          ${isAllDone
            ? `<span class="progress-complete-banner">${esc(tr('plan.completeBanner', {total: items.length}))}</span>`
            : `<span class="progress-remaining-text">${esc(tr('plan.remainingSummary', {count: remainingCount, minutes: estRemainingMinutes}))}</span>`}
        </div>
        ${!isAllDone && nextWork ? `<div class="progress-next-strip">
          <button type="button" class="progress-next-info" data-open-detail="${esc(nextWork.id)}">
            ${thumbMarkup(ctx, nextWork, 'thumb-xs')}
            <span>
              <small>${esc(tr('plan.nextStopLabel'))}</small>
              <strong>${esc(nextWork.title)}</strong>
              <em>${esc(workStatus(nextWork, lang))}</em>
            </span>
          </button>
          <div class="progress-next-actions">
            <button type="button" class="done-quick-cta" data-toggle-viewed="${esc(nextWork.id)}">${esc(tr('plan.markDoneCta'))}</button>
            ${navigationIndex.nodes.has(`work:${nextWork.id}`) ? `<button type="button" class="action-chip" data-show-map="${esc(nextWork.id)}">${esc(tr('plan.mapBtn'))}</button>` : ''}
          </div>
        </div>` : ''}
      </div>` : ''}

      ${items.length ? `<p class="plan-meta-line">${esc(tr('plan.metaLine', {est: plan.estimatedMinutes, visit: plan.visitMinutes, walk: plan.walkMinutes, audio: plan.audioMinutes, buffer: plan.bufferMinutes}))}</p>` : ''}
      ${items.length ? `<div class="plan-summary-actions">
        ${plan.isCustom && plan.routableIds.length >= 2 ? `<button type="button" class="optimize-plan-btn" data-optimize-myplan>${esc(tr('plan.optimizeBtn'))}</button>` : ''}
        <button type="button" class="secondary compact-btn" data-bulk-download ${state.bulkDownload.active || allSaved ? 'disabled' : ''}>${esc(saveBtnText)}</button>
        <div class="route-mode-subtoggle" role="group" aria-label="${esc(tr('map.routeModeAria'))}">
          <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">${esc(tr('course.shortest'))}</button>
          <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">${esc(tr('course.elevatorShort'))}</button>
        </div>
      </div>` : ''}
    </section>

    ${!items.length ? `<section class="empty-plan-box">
      <h2>${esc(tr('plan.emptyTitle'))}</h2>
      <p>${tr('plan.emptyBody', {total: works.length})}</p>
      <button type="button" class="primary" data-go-audio-mapped>${esc(tr('plan.emptyBtn'))}</button>
    </section>` : `<ol class="plan-list">
      ${items.map((rawWork, index) => {
        const work = localizeWork(rawWork, lang);
        const isViewed = state.viewed.has(work.id);
        const isDest = work.id === destId;
        const isPlaying = state.playing === work.id;
        const hasMap = navigationIndex.nodes.has(`work:${work.id}`);
        const est = estimates[work.id];
        return `<li class="plan-card ${isDest ? 'is-destination' : ''} ${isViewed ? 'is-viewed' : ''}">
          <div class="plan-card-main" data-open-detail="${esc(work.id)}" role="button" tabindex="0">
            <span class="plan-order ${isViewed ? 'is-done' : ''}">${isViewed ? '✓' : index + 1}</span>
            ${thumbMarkup(ctx, work, 'thumb-md')}
            <div class="plan-card-copy">
              <div class="plan-card-badges">
                ${priorityBadgeMarkup(work, lang)}
                ${isDest ? `<span class="status-pill dest">${esc(tr('plan.statusDest'))}</span>` : isViewed ? `<span class="status-pill done">${esc(tr('plan.statusDone'))}</span>` : `<span class="status-pill">${esc(tr('plan.statusPlanned'))}</span>`}
                ${!hasMap ? `<span class="status-pill warn">${esc(tr('plan.statusUnmapped'))}</span>` : ''}
              </div>
              <strong>${esc(work.title)}</strong>
              <small>${esc(creatorMeta(work, lang))}</small>
              <div class="plan-meta-chips">
                <small class="plan-loc-line">${esc(workStatus(work, lang))}</small>
                ${est ? `<span class="elapsed-pill">${esc(est.elapsedLabel)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="plan-card-actions">
            <button type="button" class="action-chip done-toggle-btn ${isViewed ? 'is-done' : isDest ? 'is-next-cta' : ''}" data-toggle-viewed="${esc(work.id)}" aria-pressed="${isViewed}">
              <span class="done-check-dot" aria-hidden="true">${isViewed ? '✓' : ''}</span>
              <span>${esc(isViewed ? tr('plan.doneShort') : isDest ? tr('plan.markDoneCta') : tr('plan.markDone'))}</span>
            </button>
            <button type="button" class="action-chip play-chip ${isPlaying ? 'active' : ''}" data-quick-play="${esc(work.id)}">${esc(isPlaying ? tr('plan.stop') : tr('plan.play'))}</button>
            ${hasMap ? `<button type="button" class="action-chip" data-show-map="${esc(work.id)}">${esc(tr('plan.mapBtn'))}</button>` : ''}
            ${plan.isCustom ? `
              <button type="button" class="icon-chip" data-move-myplan="${esc(work.id)}" data-delta="-1" ${index === 0 ? 'disabled' : ''} aria-label="${esc(tr('plan.moveUpAria'))}">↑</button>
              <button type="button" class="icon-chip" data-move-myplan="${esc(work.id)}" data-delta="1" ${index === items.length - 1 ? 'disabled' : ''} aria-label="${esc(tr('plan.moveDownAria'))}">↓</button>
              <button type="button" class="icon-chip danger" data-remove-myplan="${esc(work.id)}" aria-label="${esc(tr('plan.removeAria'))}">✕</button>
            ` : ''}
          </div>
        </li>`;
      }).join('')}
    </ol>`}
    ${plan.isCustom && items.length ? `<div class="add-more-wrap"><button type="button" class="secondary" data-go-audio-mapped>${esc(tr('plan.addMoreBtn'))}</button></div>` : ''}
  </main>`;
}

export function wirePlanTab(ctx) {
  const {byId, planActions, audio} = ctx;

  document.querySelectorAll('[data-switch-preset]').forEach(btn => {
    btn.onclick = () => planActions.choosePresetCourse(btn.dataset.switchPreset, {goMap: false});
  });
  document.querySelector('[data-switch-myplan]')?.addEventListener('click', () => planActions.chooseMyPlan({goMap: false}));
  document.querySelector('[data-optimize-myplan]')?.addEventListener('click', planActions.handleOptimizeMyPlan);
  document.querySelectorAll('[data-quick-play]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.quickPlay;
      audio.toggleAudio(id, ctx.preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-move-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      planActions.handleMoveMyPlan(btn.dataset.moveMyplan, Number(btn.dataset.delta));
    };
  });
  document.querySelectorAll('[data-remove-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      planActions.handleRemoveMyPlan(btn.dataset.removeMyplan);
    };
  });
}
