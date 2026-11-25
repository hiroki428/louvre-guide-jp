import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexNavigationGraph, navigationStateFromRoute, buildNavigationView} from '../src/navigation.js';
import {activePlanMeta, buildTimedRouteWorks, formatMinutesLabel, moveMyPlanItem, optimizeWorkOrder, paceSummaryFor, planStopEstimates, removeMyPlanItem, routableWorkIds, timeCourseBounds, toggleMyPlan} from '../src/my-plan.js';
import {createAppStore, STORAGE_KEY} from '../src/app/state.js';
import {createPlanActions} from '../src/app/plan-actions.js';
import {planTabView} from '../src/views/plan-tab.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

let list = [];
let res = toggleMyPlan(list, 'mona');
assert.equal(res.added, true);
assert.deepEqual(res.ids, ['mona']);

res = toggleMyPlan(res.ids, 'catalog-0001');
assert.deepEqual(res.ids, ['mona', 'catalog-0001']);

res = toggleMyPlan(res.ids, 'catalog-0010');
assert.deepEqual(res.ids, ['mona', 'catalog-0001', 'catalog-0010']);

const movedUp = moveMyPlanItem(res.ids, 'catalog-0001', -1);
assert.deepEqual(movedUp, ['catalog-0001', 'mona', 'catalog-0010']);

const movedClamp = moveMyPlanItem(movedUp, 'catalog-0001', -1);
assert.deepEqual(movedClamp, ['catalog-0001', 'mona', 'catalog-0010']);

const routable = routableWorkIds(index, movedUp);
assert.deepEqual(routable, ['catalog-0001', 'mona'], 'off-view or unmapped works are excluded from map routing while kept in the plan list');

const meta = activePlanMeta({
  planMode: 'myplan',
  minutes: 90,
  routes,
  myPlanIds: movedUp,
  navigationIndex: index,
  duration: 40
});
assert.equal(meta.isCustom, true);
assert.equal(meta.ids.length, 3);
assert.deepEqual(meta.routableIds, ['catalog-0001', 'mona']);
assert.ok(meta.estimatedMinutes > 0);

const navState = navigationStateFromRoute(index, meta.routableIds);
const navView = buildNavigationView(index, navState);
assert.equal(navView.available, true, 'custom my-plan must generate a valid route from the entrance');
assert.equal(navView.destinationNode.workId, 'catalog-0001');
assert.ok(navView.plannedSegments.length > 0, 'subsequent custom plan legs must render');

const removed = removeMyPlanItem(movedUp, 'mona');
assert.deepEqual(removed, ['catalog-0001', 'catalog-0010']);

assert.equal(formatMinutesLabel(45), '45分');
assert.equal(formatMinutesLabel(12.5), '12.5分');

const estimates = planStopEstimates(meta, index, {preferElevator: false});
assert.equal(Object.keys(estimates).length, meta.ids.length);
let prevElapsed = 0;
for (const id of meta.ids) {
  const est = estimates[id];
  assert.ok(est && est.elapsedMinutes > prevElapsed, `elapsedMinutes must increase for ${id}`);
  assert.match(est.elapsedLabel, /^ここまで 約/, `elapsedLabel must be formatted for ${id}`);
  prevElapsed = est.elapsedMinutes;
}

const presetMeta = activePlanMeta({
  planMode: 'preset',
  minutes: 90,
  routes,
  myPlanIds: [],
  navigationIndex: index,
  duration: 40
});
const presetEst = planStopEstimates(presetMeta, index, {preferElevator: true});
assert.equal(Object.keys(presetEst).length, presetMeta.ids.length);
assert.ok(presetEst[presetMeta.ids.at(-1)].elapsedMinutes > 0);

const jumbled = ['lacemaker', 'mona', 'marly', 'venus', 'catalog-0003', 'catalog-0010'];
const opt = optimizeWorkOrder(index, jumbled, {preferElevator: false});
assert.equal(opt.ids.length, jumbled.length, 'optimizer must keep every work including unmapped ones');
assert.equal(opt.ids.at(-1), 'catalog-0010', 'unmapped works should remain at the end');
assert.equal(opt.changed, true, 'jumbled multi-floor order should be reordered');
assert.ok(opt.afterCost < opt.beforeCost, 'optimized route must have strictly lower cost');
assert.ok(opt.savedPercent > 0, 'savedPercent should be positive when cost improves');
const monaPos = opt.ids.indexOf('mona');
const canaPos = opt.ids.indexOf('catalog-0003');
assert.equal(Math.abs(monaPos - canaPos), 1, 'same-room works (room 711) must stay adjacent');
const optAgain = optimizeWorkOrder(index, opt.ids, {preferElevator: false});
assert.equal(optAgain.afterCost, opt.afterCost, 'optimizing an already optimal list must preserve optimal cost');

const optElev = optimizeWorkOrder(index, jumbled, {preferElevator: true});
assert.equal(optElev.ids.length, jumbled.length);
assert.ok(optElev.afterCost <= optElev.beforeCost, 'elevator-priority optimizer must not worsen cost');

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const b90 = timeCourseBounds(90, 100);
assert.equal(b90.recommended, 8);
assert.equal(b90.max, 14);
const b180 = timeCourseBounds(180, 100);
assert.equal(b180.recommended, 18);
assert.equal(b180.max, 32);
assert.equal(paceSummaryFor(90, 8, b90).key, 'recommended');
assert.equal(paceSummaryFor(90, 14, b90).key, 'limit');
assert.equal(paceSummaryFor(90, 4, b90).key, 'relaxed');

const customTimed = buildTimedRouteWorks(works, index, {minutes: 120, count: 16, preferElevator: false});
assert.equal(customTimed.ids.length, 16, 'timed route builder must return requested work count');
assert.ok(customTimed.ids.includes('mona'), 'timed route must prioritize 超有名 works like Mona Lisa');
const timedMeta = activePlanMeta({
  planMode: 'preset',
  routeId: 'preset-120',
  minutes: 120,
  routes,
  myPlanIds: [],
  navigationIndex: index,
  customTimedIds: customTimed.ids,
  customTimedMinutes: 120
});
assert.equal(timedMeta.ids.length, 16);
assert.match(timedMeta.label, /120分コース（16作品）/);

const theme = routes.find(route => route.kind === 'theme');
const extraWork = works.find(work => index.nodes.has(`work:${work.id}`) && !theme.ids.includes(work.id) && !routes.find(route => route.id === 'preset-90').ids.includes(work.id));
const saved = new Map();
globalThis.localStorage = {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value)};
const store = createAppStore({
  works, routes, byId: Object.fromEntries(works.map(work => [work.id, work])),
  worksByFloorRoom: new Map(), navigationIndex: index,
  persistedBoot: {routeId: theme.id, planMode: 'preset', hasChosenCourse: true},
  skipSplashImmediate: true, appBase: new URL('../', import.meta.url)
});
const ctx = {...store, works, routes, byId: Object.fromEntries(works.map(work => [work.id, work])), navigationIndex: index, setNotice() {}, render() {}};
const actions = createPlanActions(ctx);
assert.equal(actions.addWorkToActivePlan(extraWork.id), true);
assert.deepEqual(new Set(ctx.currentPlan().ids), new Set([...theme.ids, extraWork.id]), 'adding a work must retain the whole theme plan');
assert.deepEqual(ctx.currentPlan().ids, optimizeWorkOrder(index, [...theme.ids, extraWork.id]).ids, 'the complete theme plan must be reordered');
assert.equal(ctx.currentPlan().subtitle, '追加した作品を含むルート', 'edited plans must not retain stale theme descriptions');
assert.equal(actions.addWorkToActivePlan(extraWork.id), false, 'duplicate additions must be ignored');
assert.deepEqual(JSON.parse(saved.get(STORAGE_KEY)).routeEdits[theme.id], ctx.currentPlan().ids, 'edited routes must persist');
store.state.routeId = 'preset-90';
assert.equal(actions.addWorkToActivePlan(extraWork.id), true);
assert.equal(store.state.routeEdits[theme.id].length, theme.ids.length + 1, 'switching courses must preserve previous edits');
assert.deepEqual(ctx.currentPlan().ids, store.state.routeEdits['preset-90'], 'time course edits must appear in the active plan');
assert.ok(ctx.currentPlan().estimatedMinutes > presetMeta.estimatedMinutes, 'added works must increase the time estimate');
store.state.routeId = theme.id;
assert.deepEqual(ctx.currentPlan().ids, store.state.routeEdits[theme.id], 'returning to a course must restore its edited order');
store.state.planAddOpen = true;
ctx.artworkImages = {};
ctx.appBase = new URL('../', import.meta.url);
const picker = planTabView(ctx, false);
assert.match(picker, /data-add-route-work=/, 'the plan must show selectable mapped works');
assert.ok(!picker.includes(`data-add-route-work="${extraWork.id}"`), 'works already in the plan must be hidden');
assert.ok(!picker.includes('data-add-route-work="catalog-0010"'), 'unmapped works must not be offered');
store.state.planAddOpen = false;
assert.match(planTabView(ctx, false), /data-open-plan-add/, 'edited theme plans must keep an add-work control');
const restoredStore = createAppStore({
  works, routes, byId: ctx.byId, worksByFloorRoom: new Map(), navigationIndex: index,
  persistedBoot: JSON.parse(saved.get(STORAGE_KEY)), skipSplashImmediate: true,
  appBase: new URL('../', import.meta.url)
});
restoredStore.state.routeId = theme.id;
assert.deepEqual(restoredStore.currentPlan().ids, store.state.routeEdits[theme.id], 'edited routes must survive app reload');

console.log('my-plan and custom routing: passed');
