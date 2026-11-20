import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexNavigationGraph, navigationStateFromRoute, buildNavigationView} from '../src/navigation.js';
import {activePlanMeta, formatMinutesLabel, moveMyPlanItem, optimizeWorkOrder, planStopEstimates, removeMyPlanItem, routableWorkIds, toggleMyPlan} from '../src/my-plan.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

let list = [];
let res = toggleMyPlan(list, 'mona');
assert.equal(res.added, true);
assert.deepEqual(res.ids, ['mona']);

res = toggleMyPlan(res.ids, 'catalog-0001');
assert.deepEqual(res.ids, ['mona', 'catalog-0001']);

res = toggleMyPlan(res.ids, 'catalog-0006');
assert.deepEqual(res.ids, ['mona', 'catalog-0001', 'catalog-0006']);

const movedUp = moveMyPlanItem(res.ids, 'catalog-0001', -1);
assert.deepEqual(movedUp, ['catalog-0001', 'mona', 'catalog-0006']);

const movedClamp = moveMyPlanItem(movedUp, 'catalog-0001', -1);
assert.deepEqual(movedClamp, ['catalog-0001', 'mona', 'catalog-0006']);

const routable = routableWorkIds(index, movedUp);
assert.deepEqual(routable, ['catalog-0001', 'mona'], 'unmapped works are excluded from map routing while kept in the plan list');

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
assert.deepEqual(removed, ['catalog-0001', 'catalog-0006']);

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

const jumbled = ['lacemaker', 'mona', 'marly', 'venus', 'catalog-0003', 'catalog-0006'];
const opt = optimizeWorkOrder(index, jumbled, {preferElevator: false});
assert.equal(opt.ids.length, jumbled.length, 'optimizer must keep every work including unmapped ones');
assert.equal(opt.ids.at(-1), 'catalog-0006', 'unmapped works should remain at the end');
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

console.log('my-plan and custom routing: passed');
