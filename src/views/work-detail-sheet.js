import {audioLengthsFor} from '../catalog.js';
import {formatMinutesLabel} from '../my-plan.js';
import {creatorMeta, esc, formatAudioLengthLabel, formatClock, formatRate, priorityBadgeMarkup, thumbMarkup, workStatus} from '../app/ui-helpers.js';

export function openWorkDetail(ctx, workId, roomWorkIds = null) {
  const work = ctx.byId[workId];
  if (!work) return;
  ctx.state.detailWorkId = workId;
  const siblings = Array.isArray(roomWorkIds) && roomWorkIds.length
    ? roomWorkIds.filter(id => ctx.byId[id])
    : ctx.roomWorksFor(work).map(item => item.id);
  ctx.state.detailRoomWorks = siblings.length > 1 ? siblings : [];
  ctx.render();
}

export function closeWorkDetail(ctx) {
  if (!ctx.state.detailWorkId) return;
  ctx.state.detailWorkId = null;
  ctx.state.detailRoomWorks = [];
  ctx.render();
}

export function workDetailSheetMarkup(ctx) {
  const {state, byId, navigationIndex, sources} = ctx;
  const player = ctx.audio.player;
  const work = state.detailWorkId ? byId[state.detailWorkId] : null;
  if (!work) return '';
  const plan = ctx.currentPlan();
  const planIdx = plan.ids.indexOf(work.id);
  const estimates = ctx.currentEstimates();
  const est = estimates[work.id];
  const lengths = audioLengthsFor(work);
  const length = ctx.preferredLengthFor(work);
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
    : ctx.roomWorksFor(work);

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
        ${thumbMarkup(ctx, work, 'thumb-hero')}
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

export function wireWorkDetailSheet(ctx) {
  const {state, byId, audio, planActions} = ctx;

  document.querySelectorAll('[data-close-detail]').forEach(el => {
    el.onclick = () => closeWorkDetail(ctx);
  });
  document.querySelectorAll('[data-switch-detail]').forEach(btn => {
    btn.onclick = () => {
      state.detailWorkId = btn.dataset.switchDetail;
      ctx.render();
    };
  });
  document.querySelectorAll('[data-detail-duration]').forEach(btn => {
    btn.onclick = () => {
      const workId = btn.dataset.detailWork;
      const length = Number(btn.dataset.detailDuration);
      state.duration = length;
      state.audioDurations[workId] = length;
      ctx.persistState();
      if (state.playing === workId) audio.toggleAudio(workId, length);
      else ctx.render();
    };
  });
  document.querySelectorAll('[data-detail-play]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.detailPlay;
      audio.toggleAudio(id, ctx.preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-detail-download]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.detailDownload;
      audio.saveAudioButton(btn, id, ctx.preferredLengthFor(byId[id]));
    };
  });
  document.querySelectorAll('[data-plan-step]').forEach(btn => {
    btn.onclick = () => {
      const nextIndex = Number(btn.dataset.planStep);
      const ids = ctx.currentPlan().ids;
      if (nextIndex < 0 || nextIndex >= ids.length) return;
      const nextId = ids[nextIndex];
      planActions.selectRouteWork(nextId, {focusFloor: false});
      state.detailWorkId = nextId;
      state.detailRoomWorks = [];
      ctx.render();
    };
  });
}
