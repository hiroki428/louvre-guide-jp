import {DEFAULT_DURATIONS, PLAYBACK_RATES} from '../app-config.js';
import {navigationStateFromRoute} from '../navigation.js';
import {esc, formatAudioLengthLabel, formatRate} from '../app/ui-helpers.js';

export function settingsTabView(ctx, hasMini) {
  const {state, sources, imageCredits} = ctx;
  const plan = ctx.currentPlan();
  const items = ctx.planWorks();
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${ctx.preferredLengthFor(w)}`));
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

export function wireSettingsTab(ctx) {
  const {state, navigationIndex, audio} = ctx;

  document.querySelector('[data-clear-cache]')?.addEventListener('click', audio.clearAudioCache);
  document.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
    if (!window.confirm('鑑賞済みチェックと現在地を初期状態に戻しますか？（マイプランはそのまま残ります）')) return;
    ctx.clearProgressNotice();
    state.viewed.clear();
    state.navigation = navigationStateFromRoute(navigationIndex, ctx.routableIds());
    state.selected = ctx.currentPlan().ids[0] ?? null;
    ctx.persistState();
    ctx.setNotice('鑑賞の進捗を最初に戻しました', false, 3500);
    ctx.render();
  });
}
