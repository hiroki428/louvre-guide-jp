import {APP_NAME} from '../app-config.js';
import {navigationStateForSelection} from '../navigation.js';
import {advanceOnRouteAudio, playbackModeFor} from '../route-progress.js';
import {audioLengthsFor} from '../catalog.js';
import {localizeWork, t} from '../i18n.js';
import {clampRate} from './state.js';
import {creatorMeta, formatClock, formatRate} from './ui-helpers.js';

// public/sw.js の AUDIO と同じ名前にすること。違うと保存した音声がオフラインで使われない。
const AUDIO_CACHE = 'louvre-audio-v2';

export function createAudioController(ctx) {
  const tr = (key, params) => t(key, params, ctx.state.lang);
  const player = new Audio();
  player.preload = 'none';
  player.playbackRate = ctx.state.playbackRate;
  let playbackSerial = 0;

  function miniPlayerContext() {
    const workId = ctx.state.player.workId;
    if (!workId || !ctx.byId[workId]) return null;
    const plan = ctx.currentPlan();
    const planIdx = plan.ids.indexOf(workId);
    if (planIdx >= 0) {
      return {
        work: ctx.byId[workId],
        source: 'plan',
        ids: plan.ids,
        index: planIdx,
        prevId: planIdx > 0 ? plan.ids[planIdx - 1] : null,
        nextId: planIdx < plan.ids.length - 1 ? plan.ids[planIdx + 1] : null,
        isLastInPlan: planIdx === plan.ids.length - 1
      };
    }
    const visibleIds = ctx.visibleAudioWorks().map(item => item.id);
    const catalogIdx = visibleIds.indexOf(workId);
    const listIds = catalogIdx >= 0 ? visibleIds : ctx.works.map(item => item.id);
    const idx = listIds.indexOf(workId);
    return {
      work: ctx.byId[workId],
      source: 'catalog',
      ids: listIds,
      index: idx,
      prevId: idx > 0 ? listIds[idx - 1] : null,
      nextId: idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null,
      isLastInPlan: false
    };
  }

  function syncSeekBars() {
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
    const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const ratio = duration > 0 ? Math.round((current / duration) * 1000) : 0;
    document.querySelectorAll('[data-seek]').forEach(input => {
      const targetId = input.dataset.seekWork;
      if (!targetId || targetId === ctx.state.player.workId) {
        input.value = String(ratio);
        input.style.setProperty('--seek-pct', `${(ratio / 10).toFixed(1)}%`);
      }
    });
    document.querySelectorAll('[data-time-current]').forEach(el => {
      const targetId = el.dataset.timeWork;
      if (!targetId || targetId === ctx.state.player.workId) el.textContent = formatClock(current);
    });
    document.querySelectorAll('[data-time-total]').forEach(el => {
      const targetId = el.dataset.timeWork;
      if (!targetId || targetId === ctx.state.player.workId) el.textContent = duration > 0 ? formatClock(duration) : '--:--';
    });
  }

  function seekBy(deltaSeconds) {
    if (!ctx.state.player.workId || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + deltaSeconds));
    syncSeekBars();
  }

  function setPlaybackRate(rate, {rerender = true} = {}) {
    const next = clampRate(rate);
    ctx.state.playbackRate = next;
    player.playbackRate = next;
    ctx.persistState();
    if (rerender) {
      ctx.render();
    } else {
      document.querySelectorAll('[data-rate-readout]').forEach(el => { el.textContent = formatRate(next); });
      document.querySelectorAll('[data-set-rate]').forEach(btn => {
        btn.classList.toggle('active', Math.abs(Number(btn.dataset.setRate) - next) < 0.01);
      });
    }
  }

  function updateMediaSession(rawWork) {
    if (!('mediaSession' in navigator) || !rawWork) return;
    const work = localizeWork(rawWork, ctx.state.lang);
    try {
      const image = ctx.artworkImages[work.id];
      const artwork = image?.src ? [{src: new URL(image.src, ctx.appBase).href, sizes: '512x512', type: 'image/jpeg'}] : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: work.title,
        artist: creatorMeta(work, ctx.state.lang),
        album: APP_NAME,
        artwork
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (ctx.state.player.workId) toggleAudio(ctx.state.player.workId, ctx.preferredLengthFor(ctx.byId[ctx.state.player.workId]));
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (!player.paused) { player.pause(); ctx.state.playing = null; ctx.render(); }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => stepMiniPlayer(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => stepMiniPlayer(1));
      navigator.mediaSession.setActionHandler('seekbackward', details => seekBy(-(details?.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekforward', details => seekBy(details?.seekOffset || 10));
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (Number.isFinite(details?.seekTime) && Number.isFinite(player.duration)) {
          player.currentTime = Math.max(0, Math.min(player.duration, details.seekTime));
          syncSeekBars();
        }
      });
    } catch { /* Media Session API optional */ }
  }

  async function stepMiniPlayer(delta, {forcePlay = false} = {}) {
    const mini = miniPlayerContext();
    if (!mini) return;
    const shouldPlay = forcePlay || Boolean(ctx.state.playing);
    const currentWork = mini.work;

    if (delta > 0) {
      ctx.state.viewed.add(currentWork.id);
      if (mini.source === 'plan') {
        const rIds = ctx.routableIds();
        if (mini.nextId) {
          if (rIds.includes(mini.nextId)) {
            ctx.state.navigation = navigationStateForSelection(ctx.navigationIndex, rIds, mini.nextId, ctx.navOptions());
          } else if (rIds.includes(currentWork.id)) {
            const advanced = advanceOnRouteAudio(ctx.navigationIndex, ctx.state.navigation, rIds, currentWork.id, ctx.navOptions());
            if (advanced.updated) ctx.state.navigation = advanced.navigation;
          }
          ctx.state.selected = mini.nextId;
          if (ctx.state.detailWorkId) ctx.state.detailWorkId = mini.nextId;
          ctx.persistState();
          if (shouldPlay) {
            await toggleAudio(mini.nextId, ctx.preferredLengthFor(ctx.byId[mini.nextId]), {skipAutoAdvance: true});
          } else {
            player.pause();
            player.currentTime = 0;
            ctx.state.player = {workId: mini.nextId, mode: playbackModeFor(ctx.navigationIndex, ctx.state.navigation, mini.nextId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
            player.src = ctx.audioPath(mini.nextId, ctx.preferredLengthFor(ctx.byId[mini.nextId]));
            ctx.setNotice(tr('audio.completedNextNotice', {current: localizeWork(currentWork, ctx.state.lang).title, next: localizeWork(ctx.byId[mini.nextId], ctx.state.lang).title}), false, 3600);
            ctx.render();
          }
        } else {
          if (rIds.includes(currentWork.id)) {
            const advanced = advanceOnRouteAudio(ctx.navigationIndex, ctx.state.navigation, rIds, currentWork.id, ctx.navOptions());
            if (advanced.updated) ctx.state.navigation = advanced.navigation;
            else if (ctx.state.navigation) ctx.state.navigation = {...ctx.state.navigation, currentNodeId: `work:${currentWork.id}`, destinationNodeId: null, routeComplete: true};
          }
          player.pause();
          ctx.state.playing = null;
          ctx.persistState();
          ctx.setNotice(tr('audio.completedAllNotice', {current: localizeWork(currentWork, ctx.state.lang).title}), false, 4500);
          ctx.render();
        }
        return;
      }

      if (mini.nextId) {
        ctx.state.selected = mini.nextId;
        if (ctx.navigationIndex.nodes.has(`work:${mini.nextId}`)) {
          ctx.planActions.selectRouteWork(mini.nextId, {focusFloor: false});
        }
        if (ctx.state.detailWorkId) ctx.state.detailWorkId = mini.nextId;
        ctx.persistState();
        if (shouldPlay) {
          await toggleAudio(mini.nextId, ctx.preferredLengthFor(ctx.byId[mini.nextId]), {skipAutoAdvance: true});
        } else {
          player.pause();
          player.currentTime = 0;
          ctx.state.player = {workId: mini.nextId, mode: playbackModeFor(ctx.navigationIndex, ctx.state.navigation, mini.nextId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
          player.src = ctx.audioPath(mini.nextId, ctx.preferredLengthFor(ctx.byId[mini.nextId]));
          ctx.render();
        }
      }
      return;
    }

    if (!mini.prevId) return;
    const prevWork = ctx.byId[mini.prevId];
    if (mini.source === 'plan') {
      const rIds = ctx.routableIds();
      if (rIds.includes(mini.prevId)) {
        ctx.state.navigation = navigationStateForSelection(ctx.navigationIndex, rIds, mini.prevId, ctx.navOptions());
      }
    } else if (ctx.navigationIndex.nodes.has(`work:${mini.prevId}`)) {
      ctx.planActions.selectRouteWork(mini.prevId, {focusFloor: false});
    }
    ctx.state.selected = mini.prevId;
    if (ctx.state.detailWorkId) ctx.state.detailWorkId = mini.prevId;
    ctx.persistState();
    if (shouldPlay) {
      await toggleAudio(mini.prevId, ctx.preferredLengthFor(prevWork), {skipAutoAdvance: true});
    } else {
      player.pause();
      player.currentTime = 0;
      ctx.state.player = {workId: mini.prevId, mode: playbackModeFor(ctx.navigationIndex, ctx.state.navigation, mini.prevId), sessionId: ++playbackSerial, hasStarted: false, arrivalHandled: false};
      player.src = ctx.audioPath(mini.prevId, ctx.preferredLengthFor(prevWork));
      ctx.setNotice(tr('audio.backTargetNotice', {title: localizeWork(prevWork, ctx.state.lang).title}), false, 3200);
      ctx.render();
    }
  }

  function closeMiniPlayer() {
    playbackSerial += 1;
    player.pause();
    player.currentTime = 0;
    ctx.state.playing = null;
    ctx.state.audio = null;
    ctx.state.audioError = '';
    ctx.state.player = {workId: null, mode: 'standalone', sessionId: playbackSerial, hasStarted: false, arrivalHandled: false};
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch { /* ignore */ }
    }
    ctx.render();
  }

  async function toggleAudio(id, length, {skipAutoAdvance = false} = {}) {
    const work = ctx.byId[id];
    if (!work) return;
    const validLengths = audioLengthsFor(work);
    const resolvedLength = validLengths.includes(length) ? length : validLengths[0];
    ctx.state.audioDurations[id] = resolvedLength;
    ctx.state.audioError = '';

    const sameTrack = ctx.state.audio === player && ctx.state.player.workId === id && player.dataset?.audioLength === String(resolvedLength);
    if (sameTrack && !player.paused) {
      player.pause();
      ctx.state.playing = null;
      ctx.render();
      return;
    }
    if (sameTrack && ctx.state.player.hasStarted && !player.ended) {
      try {
        player.playbackRate = ctx.state.playbackRate;
        await player.play();
        ctx.state.playing = id;
        ctx.render();
        syncSeekBars();
      } catch {
        ctx.state.audioError = tr('audio.errorResume');
        ctx.render();
      }
      return;
    }

    if (ctx.state.audio === player) {
      player.pause();
      player.currentTime = 0;
    }
    const sessionId = ++playbackSerial;
    const mode = playbackModeFor(ctx.navigationIndex, ctx.state.navigation, id);
    ctx.state.player = {workId: id, mode, sessionId, hasStarted: false, arrivalHandled: false};
    ctx.state.audio = player;
    player.dataset.audioLength = String(resolvedLength);
    player.src = ctx.audioPath(id, resolvedLength);
    player.playbackRate = ctx.state.playbackRate;
    player.onended = () => {
      if (ctx.state.player.sessionId !== sessionId) return;
      ctx.state.playing = null;
      if (ctx.state.autoPlayNext) {
        const mini = miniPlayerContext();
        if (mini?.nextId) {
          stepMiniPlayer(1, {forcePlay: true});
          return;
        }
      }
      ctx.render();
      syncSeekBars();
    };
    try {
      await player.play();
      if (ctx.state.player.sessionId !== sessionId) return;
      ctx.state.player.hasStarted = true;
      ctx.state.playing = id;
      ctx.state.viewed.add(id);
      updateMediaSession(work);
      if (!skipAutoAdvance && mode === 'route' && !ctx.state.player.arrivalHandled) {
        ctx.state.player.arrivalHandled = true;
        if (ctx.planActions.handleRouteArrival(id, `playback-${sessionId}:${id}`)) {
          syncSeekBars();
          return;
        }
      }
      ctx.persistState();
      ctx.render();
      syncSeekBars();
    } catch {
      if (ctx.state.player.sessionId !== sessionId) return;
      ctx.state.playing = null;
      ctx.state.player.hasStarted = false;
      ctx.state.audioError = tr('audio.errorPlay');
      ctx.render();
    }
  }

  async function saveSingleAudio(id, length) {
    if (!('caches' in window)) return false;
    const url = ctx.audioPath(id, length);
    const response = await fetch(url);
    if (!response.ok) throw new Error('audio unavailable');
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(url, response.clone());
    ctx.state.downloaded.add(`${id}-${length}`);
    ctx.state.audioDurations[id] = length;
    return true;
  }

  async function saveAudioButton(button, id, length) {
    button.disabled = true;
    button.textContent = tr('audio.saving');
    try {
      await saveSingleAudio(id, length);
      ctx.setNotice(tr('audio.savedSingleNotice', {title: localizeWork(ctx.byId[id], ctx.state.lang)?.title ?? ''}), false, 3000);
      ctx.render();
    } catch {
      button.textContent = tr('audio.saveFailed');
      button.disabled = false;
    }
  }

  async function downloadCurrentPlanAudio() {
    if (ctx.state.bulkDownload.active) return;
    const targets = ctx.planWorks();
    if (!targets.length) return;
    ctx.state.bulkDownload = {active: true, done: 0, total: targets.length};
    ctx.render();
    let success = 0;
    for (const work of targets) {
      const length = ctx.preferredLengthFor(work);
      const key = `${work.id}-${length}`;
      if (ctx.state.downloaded.has(key)) {
        success += 1;
        ctx.state.bulkDownload.done += 1;
        continue;
      }
      try {
        await saveSingleAudio(work.id, length);
        success += 1;
      } catch { /* continue remaining */ }
      ctx.state.bulkDownload.done += 1;
      ctx.render();
    }
    ctx.state.bulkDownload = {active: false, done: 0, total: 0};
    ctx.setNotice(tr('audio.savedBulkNotice', {success, total: targets.length}), false, 4000);
    ctx.render();
  }

  async function clearAudioCache() {
    if (!('caches' in window)) return;
    try {
      await caches.delete(AUDIO_CACHE);
      await caches.delete('louvre-audio-v1'); // 以前の版が誤って使っていた保存先の掃除
      ctx.state.downloaded.clear();
      ctx.setNotice(tr('audio.clearedCacheNotice'), false, 3500);
      ctx.render();
    } catch {
      ctx.setNotice(tr('audio.clearCacheErrorNotice'), false, 3500);
      ctx.render();
    }
  }

  async function loadDownloads() {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(AUDIO_CACHE);
      const requests = await cache.keys();
      const cachedUrls = new Set(requests.map(req => req.url));
      for (const work of ctx.works) {
        for (const length of audioLengthsFor(work)) {
          if (cachedUrls.has(ctx.audioPath(work.id, length))) {
            ctx.state.downloaded.add(`${work.id}-${length}`);
          }
        }
      }
    } catch { /* offline cache optional */ }
  }

  return {
    player,
    miniPlayerContext,
    syncSeekBars,
    seekBy,
    setPlaybackRate,
    updateMediaSession,
    stepMiniPlayer,
    closeMiniPlayer,
    toggleAudio,
    saveSingleAudio,
    saveAudioButton,
    downloadCurrentPlanAudio,
    clearAudioCache,
    loadDownloads
  };
}
