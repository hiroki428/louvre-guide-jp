import {audioLengthsFor, catalogWorks, priorityTierFor} from '../catalog.js';
import {localizeWork, t} from '../i18n.js';
import {creatorMeta, esc, formatAudioLengthLabel, formatRate, priorityBadgeMarkup, thumbMarkup, workStatus} from '../app/ui-helpers.js';

export function visibleAudioWorks(ctx) {
  const {works, state} = ctx;
  return catalogWorks(works, {
    query: state.audioQuery,
    sort: state.audioSort,
    filter: state.audioFilter,
    myPlanIds: state.myPlanIds,
    lang: state.lang
  });
}

export function audioRowsMarkup(ctx, items) {
  const {state} = ctx;
  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  if (!items.length) {
    return `<div class="empty-catalog"><p>${esc(tr('catalog.emptyMsg'))}</p><button type="button" class="secondary compact-btn" data-reset-audio-filter>${esc(tr('catalog.resetFilterBtn'))}</button></div>`;
  }
  const myPlanSet = new Set(state.myPlanIds);
  return items.map(rawWork => {
    const work = localizeWork(rawWork, lang);
    const lengths = audioLengthsFor(work);
    const length = ctx.preferredLengthFor(work);
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
      ? `<select data-audio-length="${esc(work.id)}" aria-label="${esc(tr('catalog.lengthAria', {title: work.title}))}">${lengths.map(opt => `<option value="${opt}" ${length === opt ? 'selected' : ''}>${esc(formatAudioLengthLabel(opt, lang))}</option>`).join('')}</select>`
      : '';
    return `<article class="audio-row ${state.selected === work.id ? 'selected' : ''} ${isPlaying ? 'is-playing' : ''}" id="audio-row-${esc(work.id)}">
      <div class="audio-row-main" data-open-detail="${esc(work.id)}" role="button" tabindex="0">
        ${thumbMarkup(ctx, work, 'thumb-sm')}
        <div class="audio-row-copy">
          <strong>${esc(work.title)}</strong>
          <small class="creator-sub">${esc(creatorMeta(work, lang))}</small>
          <div class="audio-row-meta">
            ${priorityBadgeMarkup(work, lang)}
            <span class="loc-tag ${locClass}">${esc(workStatus(work, lang))}</span>
            ${saved ? `<span class="download-state saved">${esc(tr('catalog.savedBadge'))}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="audio-row-controls">
        ${lengthSelect}
        <button type="button" class="star-btn ${inMyPlan ? 'active' : ''}" data-toggle-myplan="${esc(work.id)}" aria-label="${esc(tr('catalog.toggleMyPlanAria'))}" aria-pressed="${inMyPlan}">${inMyPlan ? '★' : '☆'}</button>
        <button type="button" class="play-btn ${isPlaying ? 'active' : ''}" data-audio-play="${esc(work.id)}" aria-label="${esc(isPlaying ? tr('catalog.pauseAria') : tr('catalog.playAria'))}">${isPlaying ? '⏸' : '▶'}</button>
        <button type="button" class="save-btn" data-audio-download="${esc(work.id)}" ${saved ? 'disabled' : ''}>${saved ? '✓' : esc(tr('catalog.saveBtn'))}</button>
      </div>
    </article>`;
  }).join('');
}

export function audioTabView(ctx, hasMini) {
  const {works, state} = ctx;
  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  const visible = visibleAudioWorks(ctx);
  const topCount = works.filter(w => priorityTierFor(w, lang).key === 'gold').length;
  const famousCount = works.filter(w => priorityTierFor(w, lang).key === 'silver').length;
  const masterpieceCount = works.filter(w => priorityTierFor(w, lang).key === 'bronze').length;
  const mappedCount = works.filter(w => w.locationPrecision === 'room').length;
  return `<main class="tab-screen audio-screen ${hasMini ? 'has-mini-player' : ''}">
    <section class="audio-header">
      <div class="audio-header-top">
        <div>
          <div class="eyebrow">${esc(tr('catalog.eyebrow'))}</div>
          <h1>${esc(tr('catalog.title', {total: works.length}))}</h1>
        </div>
        <button type="button" class="audio-settings-trigger" data-open-audio-settings aria-label="${esc(tr('catalog.audioSettingsOpenAria'))}">
          <span aria-hidden="true">⚙</span>
          <span>${esc(tr('catalog.audioSettingsBtn', {rate: formatRate(state.playbackRate)}))}</span>
        </button>
      </div>
    </section>
    <section class="audio-catalog" aria-label="${esc(tr('catalog.listAria'))}">
      <div class="audio-search-bar">
        <input type="search" data-audio-search value="${esc(state.audioQuery)}" placeholder="${esc(tr('catalog.searchPlaceholder'))}" aria-label="${esc(tr('catalog.searchAria'))}">
        <button type="button" class="search-clear-btn ${state.audioQuery ? '' : 'hidden'}" data-clear-search aria-label="${esc(tr('catalog.clearSearchAria'))}">✕</button>
      </div>
      <div class="filter-chips" role="group" aria-label="${esc(tr('catalog.filterAria'))}">
        <button type="button" class="filter-chip ${state.audioFilter === 'all' ? 'active' : ''}" data-audio-filter="all">${esc(tr('catalog.filterAll', {count: works.length}))}</button>
        <button type="button" class="filter-chip chip-gold ${state.audioFilter === 'top' ? 'active' : ''}" data-audio-filter="top">${esc(tr('catalog.filterTop', {count: topCount}))}</button>
        <button type="button" class="filter-chip chip-silver ${state.audioFilter === 'famous' ? 'active' : ''}" data-audio-filter="famous">${esc(tr('catalog.filterFamous', {count: famousCount}))}</button>
        <button type="button" class="filter-chip chip-bronze ${state.audioFilter === 'masterpiece' ? 'active' : ''}" data-audio-filter="masterpiece">${esc(tr('catalog.filterMasterpiece', {count: masterpieceCount}))}</button>
        <button type="button" class="filter-chip ${state.audioFilter === 'mapped' ? 'active' : ''}" data-audio-filter="mapped">${esc(tr('catalog.filterMapped', {count: mappedCount}))}</button>
        <button type="button" class="filter-chip ${state.audioFilter === 'myplan' ? 'active' : ''}" data-audio-filter="myplan">${esc(tr('catalog.filterMyPlan', {count: state.myPlanIds.length}))}</button>
      </div>
      <div class="audio-sort-row">
        <span class="audio-count" aria-live="polite">${esc(tr('catalog.countLine', {visible: visible.length, total: works.length}))}</span>
        <label class="sort-select-wrap">
          <span>${esc(tr('catalog.sortLabel'))}</span>
          <select data-audio-sort>
            <option value="rank-asc" ${state.audioSort === 'rank-asc' ? 'selected' : ''}>${esc(tr('catalog.sortRank'))}</option>
            <option value="title-asc" ${state.audioSort === 'title-asc' ? 'selected' : ''}>${esc(tr('catalog.sortTitleAsc'))}</option>
            <option value="title-desc" ${state.audioSort === 'title-desc' ? 'selected' : ''}>${esc(tr('catalog.sortTitleDesc'))}</option>
            <option value="room-asc" ${state.audioSort === 'room-asc' ? 'selected' : ''}>${esc(tr('catalog.sortRoomAsc'))}</option>
            <option value="room-desc" ${state.audioSort === 'room-desc' ? 'selected' : ''}>${esc(tr('catalog.sortRoomDesc'))}</option>
          </select>
        </label>
      </div>
      <div class="audio-list">${audioRowsMarkup(ctx, visible)}</div>
    </section>
  </main>`;
}

export function wireAudioRows(ctx) {
  const {state, byId, audio, planActions} = ctx;

  document.querySelectorAll('[data-audio-play]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.audioPlay;
      const select = document.querySelector(`[data-audio-length="${id}"]`);
      const length = select ? Number(select.value) : ctx.preferredLengthFor(byId[id]);
      audio.toggleAudio(id, length);
    };
  });
  document.querySelectorAll('[data-audio-length]').forEach(select => {
    select.onchange = () => {
      const id = select.dataset.audioLength;
      state.audioDurations[id] = Number(select.value);
      refreshAudioList(ctx);
    };
  });
  document.querySelectorAll('[data-audio-download]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const id = btn.dataset.audioDownload;
      const select = document.querySelector(`[data-audio-length="${id}"]`);
      const length = select ? Number(select.value) : ctx.preferredLengthFor(byId[id]);
      audio.saveAudioButton(btn, id, length);
    };
  });
  document.querySelectorAll('.audio-list [data-toggle-myplan]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      planActions.handleToggleMyPlan(btn.dataset.toggleMyplan);
    };
  });
  document.querySelectorAll('.audio-list [data-open-detail]').forEach(el => {
    const open = () => ctx.openWorkDetail(el.dataset.openDetail);
    el.onclick = open;
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
  });
  document.querySelector('[data-reset-audio-filter]')?.addEventListener('click', () => {
    state.audioQuery = '';
    state.audioFilter = 'all';
    ctx.render();
  });
}

export function refreshAudioList(ctx) {
  const visible = visibleAudioWorks(ctx);
  const list = document.querySelector('.audio-list');
  const count = document.querySelector('.audio-count');
  const clearBtn = document.querySelector('[data-clear-search]');
  if (list) list.innerHTML = audioRowsMarkup(ctx, visible);
  if (count) count.textContent = t('catalog.countLine', {visible: visible.length, total: ctx.works.length}, ctx.state.lang);
  if (clearBtn) clearBtn.classList.toggle('hidden', !ctx.state.audioQuery);
  wireAudioRows(ctx);
}

export function wireAudioTab(ctx) {
  const {state} = ctx;

  document.querySelector('[data-audio-search]')?.addEventListener('input', event => {
    state.audioQuery = event.target.value;
    refreshAudioList(ctx);
  });
  document.querySelector('[data-clear-search]')?.addEventListener('click', () => {
    state.audioQuery = '';
    const input = document.querySelector('[data-audio-search]');
    if (input) { input.value = ''; input.focus(); }
    refreshAudioList(ctx);
  });
  document.querySelector('[data-audio-sort]')?.addEventListener('change', event => {
    state.audioSort = event.target.value;
    refreshAudioList(ctx);
  });
  document.querySelectorAll('[data-audio-filter]').forEach(btn => {
    btn.onclick = () => {
      state.audioFilter = btn.dataset.audioFilter;
      ctx.render();
    };
  });
  wireAudioRows(ctx);
}
