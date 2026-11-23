import {destinationWorkId} from '../route-progress.js';
import {creatorMeta, esc, priorityBadgeMarkup, thumbMarkup, workStatus} from '../app/ui-helpers.js';

export function planTabView(ctx, hasMini) {
  const {state, routes, works, navigationIndex} = ctx;
  const plan = ctx.currentPlan();
  const items = ctx.planWorks();
  const estimates = ctx.currentEstimates();
  const destId = destinationWorkId(navigationIndex, state.navigation);
  const viewedInPlan = items.filter(w => state.viewed.has(w.id)).length;
  const pct = items.length ? Math.round((viewedInPlan / items.length) * 100) : 0;
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${ctx.preferredLengthFor(w)}`));
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
            ${thumbMarkup(ctx, work, 'thumb-md')}
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
