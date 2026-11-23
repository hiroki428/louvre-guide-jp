import {DEFAULT_DURATIONS, PLAYBACK_RATES} from '../app-config.js';
import {creatorMeta, esc, formatAudioLengthLabel, formatClock, formatRate, thumbMarkup} from '../app/ui-helpers.js';

export function miniPlayerMarkup(ctx) {
  const {state, audio} = ctx;
  const player = audio.player;
  const mini = audio.miniPlayerContext();
  if (!mini) return '';
  const {work, prevId, nextId, isLastInPlan} = mini;
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
        ${thumbMarkup(ctx, work, 'thumb-mini')}
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

export function audioSettingsModalMarkup(ctx) {
  const {state} = ctx;
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

export function wireMiniPlayer(ctx) {
  const {state, byId, audio} = ctx;
  const player = audio.player;

  document.querySelectorAll('[data-mini-play]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.miniPlay;
      audio.toggleAudio(id, ctx.preferredLengthFor(byId[id]));
    };
  });
  document.querySelector('[data-mini-prev]')?.addEventListener('click', () => audio.stepMiniPlayer(-1));
  document.querySelector('[data-mini-next]')?.addEventListener('click', () => audio.stepMiniPlayer(1));
  document.querySelector('[data-mini-close]')?.addEventListener('click', audio.closeMiniPlayer);
  document.querySelectorAll('[data-seek-delta]').forEach(btn => {
    btn.onclick = () => audio.seekBy(Number(btn.dataset.seekDelta));
  });
  document.querySelectorAll('[data-seek]').forEach(input => {
    input.addEventListener('input', event => {
      const workId = input.dataset.seekWork;
      if (workId && state.player.workId !== workId) return;
      if (Number.isFinite(player.duration) && player.duration > 0) {
        player.currentTime = player.duration * (Number(event.target.value) / 1000);
        audio.syncSeekBars();
      }
    });
  });
}

export function wireAudioSettingsModal(ctx) {
  const {state, audio} = ctx;

  document.querySelectorAll('[data-open-audio-settings]').forEach(btn => {
    btn.onclick = () => {
      state.audioSettingsOpen = true;
      ctx.render();
    };
  });
  document.querySelectorAll('[data-close-audio-settings]').forEach(el => {
    el.onclick = () => {
      state.audioSettingsOpen = false;
      ctx.render();
    };
  });
  document.querySelector('[data-rate-slider]')?.addEventListener('input', event => {
    audio.setPlaybackRate(Number(event.target.value), {rerender: false});
  });
  document.querySelectorAll('[data-toggle-autoplay]').forEach(btn => {
    btn.onclick = () => {
      state.autoPlayNext = !state.autoPlayNext;
      ctx.persistState();
      ctx.render();
    };
  });
  document.querySelectorAll('[data-set-large-text]').forEach(btn => {
    btn.onclick = () => {
      state.largeText = btn.dataset.setLargeText === 'true';
      ctx.persistState();
      ctx.render();
    };
  });
  document.querySelectorAll('[data-set-rate]').forEach(btn => {
    btn.onclick = () => audio.setPlaybackRate(Number(btn.dataset.setRate));
  });
  document.querySelectorAll('[data-default-duration]').forEach(btn => {
    btn.onclick = () => {
      state.duration = Number(btn.dataset.defaultDuration);
      ctx.persistState();
      ctx.render();
    };
  });
}
