import {DEFAULT_DURATIONS, PLAYBACK_RATES} from '../app-config.js';
import {navigationStateFromRoute} from '../navigation.js';
import {SUPPORTED_LANGS, t} from '../i18n.js';
import {esc, formatAudioLengthLabel, formatRate} from '../app/ui-helpers.js';

export function settingsTabView(ctx, hasMini) {
  const {state, sources, imageCredits} = ctx;
  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  const plan = ctx.currentPlan();
  const items = ctx.planWorks();
  const allSaved = items.length > 0 && items.every(w => state.downloaded.has(`${w.id}-${ctx.preferredLengthFor(w)}`));
  const saveBtnText = state.bulkDownload.active
    ? tr('plan.savingBulk', {done: state.bulkDownload.done, total: state.bulkDownload.total})
    : allSaved
      ? tr('settings.allSaved')
      : tr('settings.bulkSaveBtn', {label: plan.label, count: items.length});

  return `<main class="tab-screen other-page ${hasMini ? 'has-mini-player' : ''}">
    <div class="eyebrow">${esc(tr('settings.eyebrow'))}</div>
    <h1>${esc(tr('settings.title'))}</h1>
    <p class="information-lead">${esc(tr('settings.lead'))}</p>

    <section class="settings-card">
      <h2>${esc(tr('settings.cardTitle'))}</h2>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('app.language'))}</strong>
          <small>${esc(tr('app.languageDesc'))}</small>
        </div>
        <div class="rate-chips" role="group" aria-label="${esc(tr('app.language'))}">
          ${SUPPORTED_LANGS.map(item => `<button type="button" class="chip ${lang === item.code ? 'active' : ''}" data-set-lang="${item.code}" aria-pressed="${lang === item.code}">${esc(item.label)}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('settings.cacheTitle'))}</strong>
          <small>${esc(tr('settings.cacheCount', {count: state.downloaded.size}))}</small>
        </div>
        <div class="setting-actions">
          <button type="button" class="primary compact-btn" data-bulk-download ${!items.length || state.bulkDownload.active || allSaved ? 'disabled' : ''}>${esc(saveBtnText)}</button>
          ${state.downloaded.size ? `<button type="button" class="secondary compact-btn" data-clear-cache>${esc(tr('settings.clearCacheBtn'))}</button>` : ''}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('course.routePrefLabel'))}</strong>
          <small>${esc(tr('settings.routePrefSub'))}</small>
        </div>
        <div class="route-mode-subtoggle">
          <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">${esc(tr('course.shortest'))}</button>
          <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">${esc(tr('course.elevator'))}</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('settings.speedTitlePrefix'))}<span data-rate-readout>${formatRate(state.playbackRate)}</span>${esc(tr('settings.speedTitleSuffix'))}</strong>
          <small>${esc(tr('settings.speedSub'))}</small>
        </div>
        <div class="rate-chips">
          ${PLAYBACK_RATES.map(r => `<button type="button" class="chip ${Math.abs(state.playbackRate - r) < 0.01 ? 'active' : ''}" data-set-rate="${r}">${r}x</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('mini.autoPlayTitle'))}</strong>
          <small>${esc(tr('settings.autoPlaySub'))}</small>
        </div>
        <button type="button" class="chip ${state.autoPlayNext ? 'active' : ''}" data-toggle-autoplay aria-pressed="${state.autoPlayNext}">${state.autoPlayNext ? 'ON' : 'OFF'}</button>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('mini.textSizeTitle'))}</strong>
          <small>${esc(tr('settings.textSizeSub'))}</small>
        </div>
        <div class="rate-chips">
          <button type="button" class="chip ${!state.largeText ? 'active' : ''}" data-set-large-text="false">${esc(tr('mini.textNormal'))}</button>
          <button type="button" class="chip ${state.largeText ? 'active' : ''}" data-set-large-text="true">${esc(tr('mini.textLarge'))}</button>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('settings.defaultDurTitle'))}</strong>
          <small>${esc(tr('settings.defaultDurSub'))}</small>
        </div>
        <div class="rate-chips">
          ${DEFAULT_DURATIONS.map(d => `<button type="button" class="chip ${state.duration === d ? 'active' : ''}" data-default-duration="${d}">${esc(formatAudioLengthLabel(d, lang))}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>${esc(tr('settings.resetTitle'))}</strong>
          <small>${esc(tr('settings.resetSub'))}</small>
        </div>
        <button type="button" class="secondary compact-btn" data-reset-progress>${esc(tr('settings.resetBtn'))}</button>
      </div>
    </section>

    <section class="visit-note">
      <h2>${esc(tr('settings.infoTitle'))}</h2>
      <ul class="information-list">
        <li><strong>${esc(tr('settings.infoLocLabel'))}</strong><span>${esc(tr('settings.infoLocBody'))}</span></li>
        <li><strong>${esc(tr('settings.infoDateLabel'))}</strong><span>${esc(tr('settings.infoDateBody', {date: sources.checkedAt}))}</span></li>
        <li><strong>${esc(tr('settings.infoMapLabel'))}</strong><a href="${esc(sources.officialMap)}" target="_blank" rel="noreferrer">${esc(tr('settings.infoMapLink'))}</a></li>
        <li><strong>${esc(tr('settings.infoPlanLabel'))}</strong><a href="${esc(sources.collectionsPlan || 'https://collections.louvre.fr/en/plan')}" target="_blank" rel="noreferrer">${esc(tr('settings.infoPlanLink'))}</a></li>
        <li><strong>${esc(tr('settings.infoDbLabel'))}</strong><a href="${esc(sources.collections || 'https://collections.louvre.fr/')}" target="_blank" rel="noreferrer">${esc(tr('settings.infoDbLink'))}</a></li>
        <li><strong>${esc(tr('settings.infoAvailLabel'))}</strong><a href="${esc(sources.availability)}" target="_blank" rel="noreferrer">${esc(tr('settings.infoAvailLink'))}</a></li>
        <li><strong>${esc(tr('settings.infoServiceLabel'))}</strong><span>${esc(tr('settings.infoServiceBody'))}</span></li>
      </ul>
    </section>

    <section class="data-scope">
      <h2>${esc(tr('settings.scopeTitle'))}</h2>
      <p>${esc(tr('settings.scopeBody'))}</p>
      <details class="image-credits">
        <summary>${esc(tr('settings.creditsSummary', {count: imageCredits.length}))}</summary>
        ${imageCredits.map(c => `<p>${esc(c.file)} · ${esc(c.artist.replace(/<[^>]*>/g, ''))} · ${esc(c.license)} <a target="_blank" rel="noreferrer" href="https://commons.wikimedia.org/wiki/${encodeURIComponent(c.file)}">${esc(tr('settings.creditSource'))}</a></p>`).join('')}
      </details>
    </section>
  </main>`;
}

export function wireSettingsTab(ctx) {
  const {state, navigationIndex, audio} = ctx;

  document.querySelector('[data-clear-cache]')?.addEventListener('click', audio.clearAudioCache);
  document.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
    if (!window.confirm(t('settings.resetConfirm', null, state.lang))) return;
    ctx.clearProgressNotice();
    state.viewed.clear();
    state.navigation = navigationStateFromRoute(navigationIndex, ctx.routableIds());
    state.selected = ctx.currentPlan().ids[0] ?? null;
    ctx.persistState();
    ctx.setNotice(t('notice.progressReset', null, state.lang), false, 3500);
    ctx.render();
  });
}
