import {navigationStateForSelection, navigationStateFromRoute} from '../navigation.js';
import {advanceOnRouteAudio, destinationWorkId} from '../route-progress.js';
import {correctLocation, findRoomCandidates} from '../location-support.js';
import {buildTimedRouteWorks, moveMyPlanItem, optimizeWorkOrder, paceSummaryFor, removeMyPlanItem, timeCourseBounds, toggleMyPlan} from '../my-plan.js';
import {localizeRoute, localizeWork, t} from '../i18n.js';
import {savePendingSharedPlan} from './plan-share.js';
import {runWithRouteLoader} from './route-loader.js';

export function createPlanActions(ctx) {
  const tr = (key, params) => t(key, params, ctx.state.lang);

  function setPreferElevator(prefer) {
    const next = Boolean(prefer);
    if (ctx.state.preferElevator === next) return;
    const apply = () => {
      ctx.state.preferElevator = next;
      ctx.persistState();
      ctx.setNotice(tr(ctx.state.preferElevator ? 'notice.evOn' : 'notice.evOff'), false, 3200);
      ctx.render();
    };
    if (ctx.state.appPhase === 'main' && ctx.routableIds().length > 0) {
      runWithRouteLoader({
        title: tr(next ? 'loader.evTitle' : 'loader.shortestTitle'),
        subtitle: ctx.currentPlan().label,
        modeBadge: tr(next ? 'course.elevatorShort' : 'course.shortest'),
        steps: [
          tr('loader.evStep1'),
          tr(next ? 'loader.evStep2' : 'loader.shortestStep2'),
          tr('loader.evStep3')
        ],
        durationMs: 1650
      }, apply);
    } else {
      apply();
    }
  }

  function choosePresetCourse(routeIdOrMinutes, {goMap = true, animate = true} = {}) {
    const target = typeof routeIdOrMinutes === 'string'
      ? ctx.routes.find(item => item.id === routeIdOrMinutes)
      : ctx.routes.find(item => item.kind !== 'theme' && item.minutes === routeIdOrMinutes);
    const chosen = localizeRoute(target || ctx.routes[0], ctx.state.lang);
    const apply = () => {
      ctx.clearProgressNotice();
      ctx.state.planMode = 'preset';
      ctx.state.routeId = chosen.id;
      ctx.state.minutes = chosen.minutes;
      ctx.state.customTimedIds = null;
      ctx.state.customTimedMinutes = null;
      ctx.state.hasChosenCourse = true;
      const ids = ctx.routableIds();
      ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
      ctx.state.selected = ids[0] ?? null;
      if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
        ctx.state.floor = ctx.byId[ids[0]].floor;
      }
      ctx.state.appPhase = 'main';
      if (goMap) ctx.state.tab = 'map';
      ctx.persistState();
      ctx.render();
      window.scrollTo({top: 0});
    };
    if (!animate) {
      apply();
      return;
    }
    runWithRouteLoader({
      title: tr('loader.presetTitle', {label: chosen.label}),
      subtitle: tr('loader.presetSubtitle', {count: chosen.ids.length, subtitle: chosen.subtitle || tr('loader.presetDefaultSub')}),
      modeBadge: tr(ctx.state.preferElevator ? 'course.elevator' : 'loader.modeShortest'),
      steps: [
        tr('loader.presetStep1'),
        tr(ctx.state.preferElevator ? 'loader.presetStep2Ev' : 'loader.presetStep2Short'),
        tr('loader.presetStep3')
      ],
      durationMs: 2250
    }, apply);
  }

  function chooseTimedCourse(minutes, count, {goMap = true, animate = true} = {}) {
    const bounds = timeCourseBounds(minutes, ctx.maxRoutableCount);
    const safeCount = Math.max(bounds.min, Math.min(bounds.max, Math.round(Number(count) || bounds.recommended)));
    const pace = paceSummaryFor(bounds.minutes, safeCount, bounds, ctx.state.lang);
    const apply = () => {
      ctx.clearProgressNotice();
      const built = buildTimedRouteWorks(ctx.works, ctx.navigationIndex, {
        minutes: bounds.minutes,
        count: safeCount,
        preferElevator: ctx.state.preferElevator
      });
      ctx.state.planMode = 'preset';
      ctx.state.routeId = `preset-${built.minutes}`;
      ctx.state.minutes = built.minutes;
      ctx.state.customTimedIds = built.ids;
      ctx.state.customTimedMinutes = built.minutes;
      ctx.state.draftMinutes = built.minutes;
      ctx.state.draftCount = built.count;
      ctx.state.hasChosenCourse = true;
      const ids = ctx.routableIds();
      ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
      ctx.state.selected = ids[0] ?? null;
      if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
        ctx.state.floor = ctx.byId[ids[0]].floor;
      }
      ctx.state.appPhase = 'main';
      if (goMap) ctx.state.tab = 'map';
      ctx.persistState();
      ctx.render();
      window.scrollTo({top: 0});
    };
    if (!animate) {
      apply();
      return;
    }
    runWithRouteLoader({
      title: tr('loader.timedTitle', {minutes: bounds.minutes, count: safeCount}),
      subtitle: tr('loader.timedSubtitle', {pace: pace.label, rec: bounds.recommended, max: bounds.max}),
      modeBadge: tr(ctx.state.preferElevator ? 'course.elevator' : 'loader.modeShortest'),
      steps: [
        tr('loader.timedStep1', {count: safeCount}),
        tr(ctx.state.preferElevator ? 'loader.presetStep2Ev' : 'loader.timedStep2Short'),
        tr('loader.timedStep3')
      ],
      durationMs: 2250
    }, apply);
  }

  function chooseMyPlan({goMap = false, animate = true} = {}) {
    const apply = () => {
      ctx.clearProgressNotice();
      ctx.state.planMode = 'myplan';
      ctx.state.hasChosenCourse = true;
      const ids = ctx.routableIds();
      ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
      ctx.state.selected = ctx.state.myPlanIds[0] ?? null;
      if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
        ctx.state.floor = ctx.byId[ids[0]].floor;
      }
      ctx.state.appPhase = 'main';
      ctx.state.tab = goMap && ids.length ? 'map' : 'plan';
      ctx.persistState();
      ctx.render();
      window.scrollTo({top: 0});
    };
    if (!animate || !ctx.state.myPlanIds.length) {
      apply();
      return;
    }
    runWithRouteLoader({
      title: tr('loader.myPlanTitle'),
      subtitle: tr('loader.myPlanSubtitle', {count: ctx.state.myPlanIds.length}),
      modeBadge: tr(ctx.state.preferElevator ? 'course.elevator' : 'loader.modeCustom'),
      steps: [
        tr('loader.myPlanStep1'),
        tr(ctx.state.preferElevator ? 'loader.myPlanStep2Ev' : 'loader.myPlanStep2Short'),
        tr('loader.myPlanStep3')
      ],
      durationMs: 2050
    }, apply);
  }

  function handleOptimizeMyPlan() {
    if (ctx.state.planMode !== 'myplan') return;
    const routableCount = ctx.routableIds().length;
    if (routableCount < 2) {
      ctx.setNotice(tr('notice.optNeedTwo'), false, 3400);
      ctx.render();
      return;
    }
    runWithRouteLoader({
      title: tr('loader.optTitle'),
      subtitle: tr('loader.optSubtitle', {count: routableCount}),
      modeBadge: tr(ctx.state.preferElevator ? 'loader.modeOptEv' : 'loader.modeOptShort'),
      steps: [
        tr('loader.optStep1'),
        tr('loader.optStep2'),
        tr('loader.optStep3')
      ],
      durationMs: 2150
    }, () => {
      const result = optimizeWorkOrder(ctx.navigationIndex, ctx.state.myPlanIds, ctx.navOptions());
      ctx.state.myPlanIds = result.ids;
      const nextRoutable = ctx.routableIds();
      ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, nextRoutable);
      ctx.state.selected = result.ids[0] ?? null;
      if (nextRoutable[0] && ctx.byId[nextRoutable[0]]?.floor != null) {
        ctx.state.floor = ctx.byId[nextRoutable[0]].floor;
      }
      ctx.persistState();
      const message = result.changed
        ? (result.savedPercent > 0
          ? tr('notice.optSaved', {pct: result.savedPercent})
          : tr('notice.optGrouped'))
        : tr('notice.optAlready');
      ctx.setNotice(message, false, 4500);
      ctx.render();
    });
  }

  function syncMyPlanNavigation() {
    if (ctx.state.planMode !== 'myplan') return;
    const ids = ctx.routableIds();
    const currentDest = destinationWorkId(ctx.navigationIndex, ctx.state.navigation);
    if (ids.length && currentDest && ids.includes(currentDest)) {
      ctx.state.navigation = navigationStateForSelection(ctx.navigationIndex, ids, currentDest, ctx.navOptions());
    } else {
      ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
    }
  }

  function selectRouteWork(workId, {focusFloor = false} = {}) {
    ctx.state.selected = workId;
    const ids = ctx.routableIds();
    if (ids.includes(workId)) {
      ctx.state.navigation = navigationStateForSelection(ctx.navigationIndex, ids, workId, ctx.navOptions());
    } else if (ctx.navigationIndex.nodes.has(`work:${workId}`)) {
      ctx.state.navigation = {
        ...(ctx.state.navigation || navigationStateFromRoute(ctx.navigationIndex, [workId])),
        destinationNodeId: `work:${workId}`,
        routeComplete: false
      };
    }
    if (focusFloor && ctx.byId[workId]?.floor != null) {
      ctx.state.floor = ctx.byId[workId].floor;
    }
    ctx.persistState();
  }

  function handleToggleMyPlan(workId) {
    const result = toggleMyPlan(ctx.state.myPlanIds, workId);
    ctx.state.myPlanIds = result.ids;
    syncMyPlanNavigation();
    ctx.persistState();
    const title = localizeWork(ctx.byId[workId], ctx.state.lang)?.title ?? tr('notice.workFallback');
    ctx.setNotice(tr(result.added ? 'notice.myPlanAdded' : 'notice.myPlanRemoved', {title}), false, 3000);
    ctx.render();
  }

  function handleMoveMyPlan(workId, delta) {
    ctx.state.myPlanIds = moveMyPlanItem(ctx.state.myPlanIds, workId, delta);
    syncMyPlanNavigation();
    ctx.persistState();
    ctx.render();
  }

  function handleRemoveMyPlan(workId) {
    ctx.state.myPlanIds = removeMyPlanItem(ctx.state.myPlanIds, workId);
    syncMyPlanNavigation();
    ctx.persistState();
    ctx.render();
  }

  function toggleViewed(workId) {
    if (ctx.state.viewed.has(workId)) ctx.state.viewed.delete(workId);
    else ctx.state.viewed.add(workId);
    ctx.persistState();
    ctx.render();
  }

  function handleRouteArrival(workId, eventId) {
    if (ctx.state.processedArrivalEvents.has(eventId)) return false;
    ctx.state.processedArrivalEvents.add(eventId);
    const ids = ctx.routableIds();
    const result = advanceOnRouteAudio(ctx.navigationIndex, ctx.state.navigation, ids, workId, ctx.navOptions());
    if (!result.updated) return false;
    ctx.state.undo = {planMode: ctx.state.planMode, routeId: ctx.state.routeId, minutes: ctx.state.minutes, navigation: result.previous, selected: ctx.state.selected};
    ctx.state.navigation = result.navigation;
    ctx.state.selected = result.nextWorkId ?? workId;
    ctx.state.viewed.add(workId);
    ctx.persistState();
    const roomText = ctx.byId[workId]?.room
      ? tr('location.room', {room: ctx.byId[workId].room})
      : (localizeWork(ctx.byId[workId], ctx.state.lang)?.title ?? tr('notice.currentLocFallback'));
    ctx.setNotice(tr('notice.arrivalUpdated', {room: roomText}), true, 6500);
    ctx.render();
    return true;
  }

  function undoArrival() {
    if (!ctx.state.undo) return;
    const snapshot = ctx.state.undo;
    ctx.state.planMode = snapshot.planMode;
    ctx.state.routeId = snapshot.routeId ?? ctx.state.routeId;
    ctx.state.minutes = snapshot.minutes;
    ctx.state.navigation = snapshot.navigation;
    ctx.state.selected = snapshot.selected;
    ctx.state.undo = null;
    ctx.persistState();
    ctx.setNotice(tr('notice.arrivalUndone'), false, 3200);
    ctx.render();
  }

  function lookupRoom(room) {
    ctx.state.support.room = room;
    ctx.state.support.candidates = findRoomCandidates(ctx.navigationIndex, ctx.works, room, ctx.state.lang);
    ctx.state.support.selectedCandidateId = ctx.state.support.candidates.length === 1 ? ctx.state.support.candidates[0].nodeId : null;
    ctx.state.support.error = ctx.state.support.candidates.length ? '' : tr('map.errCheckRoom');
    ctx.state.support.open = true;
    ctx.state.support.editing = true;
    ctx.render();
  }

  function confirmLocationCorrection() {
    const candidateId = ctx.state.support.selectedCandidateId;
    if (!candidateId) {
      ctx.state.support.error = ctx.state.support.candidates.length > 1 ? tr('map.errSelectCandidate') : tr('map.errCheckRoom');
      ctx.render();
      return;
    }
    const result = correctLocation(ctx.navigationIndex, ctx.state.navigation, candidateId, ctx.navOptions());
    if (!result.updated) {
      ctx.state.support.error = result.message;
      ctx.render();
      return;
    }
    const candidate = ctx.state.support.candidates.find(item => item.nodeId === candidateId);
    ctx.clearProgressNotice();
    ctx.state.navigation = result.navigation;
    ctx.state.support = {open: false, editing: false, room: '', candidates: [], selectedCandidateId: null, error: ''};
    ctx.persistState();
    ctx.setNotice(tr('notice.arrivalUpdated', {room: candidate?.label ?? tr('notice.enteredRoomFallback')}), false, 4200);
    ctx.render();
  }

  function captureReturnSnapshot() {
    if (ctx.state.planMode === 'shared') return;
    ctx.state.returnPlanSnapshot = {
      planMode: ctx.state.planMode,
      routeId: ctx.state.routeId,
      minutes: ctx.state.minutes,
      customTimedIds: ctx.state.customTimedIds ? [...ctx.state.customTimedIds] : null,
      customTimedMinutes: ctx.state.customTimedMinutes,
      selected: ctx.state.selected,
      floor: ctx.state.floor
    };
  }

  function activateSharedPlan(shared) {
    if (!shared || !Array.isArray(shared.ids) || !shared.ids.length) return;
    const validIds = shared.ids.filter(id => ctx.byId[id]);
    if (!validIds.length) return;
    ctx.clearProgressNotice();
    captureReturnSnapshot();
    ctx.state.sharedPlan = {title: shared.title || '', ids: validIds};
    ctx.state.planMode = 'shared';
    ctx.state.hasChosenCourse = true;
    ctx.state.incomingSharedPlan = null;
    savePendingSharedPlan(null);
    const ids = ctx.routableIds();
    ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
    ctx.state.selected = validIds[0] ?? null;
    if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
      ctx.state.floor = ctx.byId[ids[0]].floor;
    }
    ctx.state.appPhase = 'main';
    ctx.state.tab = ids.length ? 'map' : 'plan';
    ctx.persistState();
    const label = ctx.state.sharedPlan.title || tr('share.defaultPlanTitle');
    ctx.setNotice(tr('share.openedNotice', {title: label}), false, 3600);
    ctx.render();
    window.scrollTo({top: 0});
  }

  function chooseSharedPlan({goMap = false} = {}) {
    if (!ctx.state.sharedPlan?.ids?.length) return;
    ctx.clearProgressNotice();
    captureReturnSnapshot();
    ctx.state.planMode = 'shared';
    ctx.state.hasChosenCourse = true;
    const ids = ctx.routableIds();
    ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
    ctx.state.selected = ctx.state.sharedPlan.ids[0] ?? null;
    if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
      ctx.state.floor = ctx.byId[ids[0]].floor;
    }
    ctx.state.appPhase = 'main';
    if (goMap && ids.length) ctx.state.tab = 'map';
    ctx.persistState();
    ctx.render();
    window.scrollTo({top: 0});
  }

  function returnToOwnPlan() {
    ctx.clearProgressNotice();
    const snap = ctx.state.returnPlanSnapshot;
    if (snap && (snap.planMode === 'myplan' || snap.planMode === 'preset')) {
      ctx.state.planMode = snap.planMode;
      if (snap.routeId) ctx.state.routeId = snap.routeId;
      if (snap.minutes) ctx.state.minutes = snap.minutes;
      ctx.state.customTimedIds = Array.isArray(snap.customTimedIds) && snap.customTimedIds.length ? [...snap.customTimedIds] : null;
      ctx.state.customTimedMinutes = ctx.state.customTimedIds ? (snap.customTimedMinutes || snap.minutes) : null;
    } else {
      ctx.state.planMode = ctx.state.myPlanIds.length ? 'myplan' : 'preset';
    }
    const ids = ctx.routableIds();
    ctx.state.navigation = navigationStateFromRoute(ctx.navigationIndex, ids);
    ctx.state.selected = (snap?.selected && ctx.byId[snap.selected]) ? snap.selected : (ids[0] ?? null);
    if (Number.isFinite(snap?.floor)) {
      ctx.state.floor = snap.floor;
    } else if (ids[0] && ctx.byId[ids[0]]?.floor != null) {
      ctx.state.floor = ctx.byId[ids[0]].floor;
    }
    ctx.persistState();
    ctx.setNotice(tr('share.returnedOwnNotice', {label: ctx.currentPlan().label}), false, 3200);
    ctx.render();
    window.scrollTo({top: 0});
  }

  function copySharedToMyPlan(shared) {
    const source = shared || ctx.state.sharedPlan;
    if (!source?.ids?.length) return;
    const validIds = source.ids.filter(id => ctx.byId[id]);
    const merged = [...new Set([...ctx.state.myPlanIds, ...validIds])];
    const addedCount = merged.length - ctx.state.myPlanIds.length;
    ctx.state.myPlanIds = merged;
    ctx.state.incomingSharedPlan = null;
    savePendingSharedPlan(null);
    syncMyPlanNavigation();
    ctx.persistState();
    ctx.setNotice(
      addedCount > 0
        ? tr('share.copiedToMyPlanNotice', {added: addedCount, total: merged.length})
        : tr('share.alreadyInMyPlanNotice'),
      false,
      3600
    );
    ctx.render();
  }

  return {
    setPreferElevator,
    choosePresetCourse,
    chooseTimedCourse,
    chooseMyPlan,
    activateSharedPlan,
    chooseSharedPlan,
    returnToOwnPlan,
    copySharedToMyPlan,
    handleOptimizeMyPlan,
    syncMyPlanNavigation,
    selectRouteWork,
    handleToggleMyPlan,
    handleMoveMyPlan,
    handleRemoveMyPlan,
    toggleViewed,
    handleRouteArrival,
    undoArrival,
    lookupRoom,
    confirmLocationCorrection
  };
}
