import {navigationStateForSelection, navigationStateFromRoute} from '../navigation.js';
import {advanceOnRouteAudio, destinationWorkId} from '../route-progress.js';
import {correctLocation, findRoomCandidates} from '../location-support.js';
import {buildTimedRouteWorks, moveMyPlanItem, optimizeWorkOrder, paceSummaryFor, removeMyPlanItem, timeCourseBounds, toggleMyPlan} from '../my-plan.js';
import {runWithRouteLoader} from './route-loader.js';

export function createPlanActions(ctx) {
  function setPreferElevator(prefer) {
    const next = Boolean(prefer);
    if (ctx.state.preferElevator === next) return;
    const apply = () => {
      ctx.state.preferElevator = next;
      ctx.persistState();
      ctx.setNotice(ctx.state.preferElevator ? 'エレベーター優先ルートに切り替えました' : '移動距離が最短のルートに切り替えました', false, 3200);
      ctx.render();
    };
    if (ctx.state.appPhase === 'main' && ctx.routableIds().length > 0) {
      runWithRouteLoader({
        title: next ? 'エレベーター優先ルートを計算中' : '最短距離ルートを再計算中',
        subtitle: ctx.currentPlan().label,
        modeBadge: next ? 'EV優先' : '最短距離',
        steps: [
          '館内フロアと階段・エレベーター接続を確認しています',
          next ? 'エレベーターを優先する階移動経路を探索しています' : '展示室間の最短経路を算出しています',
          '各作品の目安経過時間を更新しています'
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
    const chosen = target || ctx.routes[0];
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
      title: `${chosen.label}を編成中`,
      subtitle: `${chosen.ids.length}作品 · ${chosen.subtitle || '館内最短動線'}`,
      modeBadge: ctx.state.preferElevator ? 'エレベーター優先' : '最短一筆書き',
      steps: [
        '展示室とフロア構造を照合しています',
        ctx.state.preferElevator ? 'エレベーター優先の移動ルートを設計しています' : '上下往復のない最短動線を計算しています',
        '音声ガイドと目安経過時間を準備しています'
      ],
      durationMs: 2250
    }, apply);
  }

  function chooseTimedCourse(minutes, count, {goMap = true, animate = true} = {}) {
    const bounds = timeCourseBounds(minutes, ctx.maxRoutableCount);
    const safeCount = Math.max(bounds.min, Math.min(bounds.max, Math.round(Number(count) || bounds.recommended)));
    const pace = paceSummaryFor(bounds.minutes, safeCount, bounds);
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
      title: `${bounds.minutes}分 · ${safeCount}作品ルートを編成中`,
      subtitle: `${pace.label}（推奨 ${bounds.recommended}作品 / 限界目安 ${bounds.max}作品）`,
      modeBadge: ctx.state.preferElevator ? 'エレベーター優先' : '最短一筆書き',
      steps: [
        `超有名作品から優先して ${safeCount}作品を選出しています`,
        ctx.state.preferElevator ? 'エレベーター優先の移動ルートを設計しています' : '上下往復のない最短一筆書きを探索しています',
        '各作品の目安経過時間と音声ガイドを準備しています'
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
      title: 'マイプランのルートを作成中',
      subtitle: `${ctx.state.myPlanIds.length}作品のお気に入りリスト`,
      modeBadge: ctx.state.preferElevator ? 'エレベーター優先' : 'カスタムルート',
      steps: [
        '選択された作品の展示室を確認しています',
        ctx.state.preferElevator ? 'エレベーター優先で館内経路を接続しています' : '入口からの館内移動ルートを計算しています',
        'プラン一覧と目安時間を仕上げています'
      ],
      durationMs: 2050
    }, apply);
  }

  function handleOptimizeMyPlan() {
    if (ctx.state.planMode !== 'myplan') return;
    const routableCount = ctx.routableIds().length;
    if (routableCount < 2) {
      ctx.setNotice('最短順に並び替えるには、展示室対応の作品が2件以上必要です', false, 3400);
      ctx.render();
      return;
    }
    runWithRouteLoader({
      title: 'マイプランを最短順に最適化中',
      subtitle: `対象 ${routableCount}作品 · ピラミッド入口から一筆書き探索`,
      modeBadge: ctx.state.preferElevator ? 'EV優先最適化' : '最短巡回探索',
      steps: [
        '全展示室間の移動距離行列を算出しています',
        '同じ展示室の作品をまとめて最短巡回順を探索しています',
        '最適化ルートと目安経過時間を反映しています'
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
          ? `最短順に並び替えました（移動距離 約${result.savedPercent}%短縮）`
          : '展示室がまとまる最短順に並び替えました')
        : 'すでに最短の順番になっています';
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
    const title = ctx.byId[workId]?.title ?? '作品';
    ctx.setNotice(result.added ? `「${title}」をマイプランに追加しました` : `「${title}」をマイプランから外しました`, false, 3000);
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
    const roomText = ctx.byId[workId]?.room ? `${ctx.byId[workId].room}室` : (ctx.byId[workId]?.title ?? '現在地');
    ctx.setNotice(`推定現在地を${roomText}として更新しました`, true, 6500);
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
    ctx.setNotice('推定現在地と経路を元に戻しました', false, 3200);
    ctx.render();
  }

  function lookupRoom(room) {
    ctx.state.support.room = room;
    ctx.state.support.candidates = findRoomCandidates(ctx.navigationIndex, ctx.works, room);
    ctx.state.support.selectedCandidateId = ctx.state.support.candidates.length === 1 ? ctx.state.support.candidates[0].nodeId : null;
    ctx.state.support.error = ctx.state.support.candidates.length ? '' : '部屋番号を確認してください';
    ctx.state.support.open = true;
    ctx.state.support.editing = true;
    ctx.render();
  }

  function confirmLocationCorrection() {
    const candidateId = ctx.state.support.selectedCandidateId;
    if (!candidateId) {
      ctx.state.support.error = ctx.state.support.candidates.length > 1 ? '翼と階を確認して候補を選択してください' : '部屋番号を確認してください';
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
    ctx.setNotice(`推定現在地を${candidate?.label ?? '入力した部屋'}として更新しました`, false, 4200);
    ctx.render();
  }

  return {
    setPreferElevator,
    choosePresetCourse,
    chooseTimedCourse,
    chooseMyPlan,
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
