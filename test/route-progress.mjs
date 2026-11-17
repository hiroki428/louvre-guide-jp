import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNavigationView, indexNavigationGraph, navigationStateFromRoute} from '../src/navigation.js';
import {advanceOnRouteAudio, playbackModeFor, validStoredProgress} from '../src/route-progress.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);
const routeIds = routes.find(route => route.minutes === 90).ids;
const initial = navigationStateFromRoute(index, routeIds);

assert.equal(playbackModeFor(index, initial, 'victory'), 'route', 'the first work is the route target from the entrance');
assert.equal(playbackModeFor(index, initial, 'mona'), 'standalone', 'a later work is standalone until it becomes next');
assert.equal(playbackModeFor(index, initial, 'liberty'), 'standalone', 'a later work is standalone until it becomes next');

const beforeArrival = buildNavigationView(index, initial);
assert.equal(beforeArrival.currentNode.id, 'entrance:pyramid:fm2');
assert.equal(beforeArrival.destinationNode.workId, 'victory');
assert.ok(beforeArrival.plannedSegments.length > 0, 'the full route after the next work remains visible');

const victoryArrival = advanceOnRouteAudio(index, initial, routeIds, 'victory');
assert.equal(victoryArrival.updated, true);
assert.equal(victoryArrival.navigation.currentNodeId, 'work:victory');
assert.equal(victoryArrival.navigation.destinationNodeId, 'work:mona');
assert.deepEqual(victoryArrival.previous, initial, 'undo snapshot preserves the exact entrance state');

const monaArrival = advanceOnRouteAudio(index, victoryArrival.navigation, routeIds, 'mona');
assert.equal(monaArrival.updated, true);
assert.equal(monaArrival.navigation.currentNodeId, 'work:mona');
assert.equal(monaArrival.navigation.destinationNodeId, 'work:liberty');
assert.equal(monaArrival.navigation.lastConfirmedWorkId, 'mona');
assert.equal(monaArrival.navigation.passedNodeIds.at(-1), 'work:mona');
assert.deepEqual(monaArrival.previous, victoryArrival.navigation, 'undo snapshot preserves the exact previous progress');

const afterArrival = buildNavigationView(index, monaArrival.navigation);
assert.equal(afterArrival.currentNode.label, 'モナ・リザ');
assert.equal(afterArrival.destinationNode.workId, 'liberty');
assert.ok(afterArrival.passedSegments.length >= beforeArrival.passedSegments.length, 'arrived route becomes passed history');
assert.notDeepEqual(afterArrival.remainingPath.nodeIds, beforeArrival.remainingPath.nodeIds, 'old unpassed plan is replaced');

const duplicateMona = advanceOnRouteAudio(index, monaArrival.navigation, routeIds, 'mona');
assert.equal(duplicateMona.updated, false, 'resume or duplicate arrival cannot update twice');
assert.equal(duplicateMona.reason, 'not-next-work');
const pastVictory = advanceOnRouteAudio(index, monaArrival.navigation, routeIds, 'victory');
assert.equal(pastVictory.updated, false, 'past standalone playback cannot move the location backwards');

const libertyArrival = advanceOnRouteAudio(index, monaArrival.navigation, routeIds, 'liberty');
assert.equal(libertyArrival.updated, true);
assert.equal(libertyArrival.navigation.currentNodeId, 'work:liberty');
assert.equal(libertyArrival.navigation.destinationNodeId, 'work:clubfoot');
assert.ok(libertyArrival.navigation.passedNodeIds.length > monaArrival.navigation.passedNodeIds.length, 'past route history is retained');

const shortRoute = ['victory','mona'];
const shortState = navigationStateFromRoute(index, shortRoute);
const shortFirstArrival = advanceOnRouteAudio(index, shortState, shortRoute, 'victory');
const completed = advanceOnRouteAudio(index, shortFirstArrival.navigation, shortRoute, 'mona');
assert.equal(completed.navigation.routeComplete, true);
assert.equal(completed.navigation.destinationNodeId, null);
assert.equal(buildNavigationView(index, completed.navigation).complete, true);

const stored = {version:2, minutes:90, routeSignature:routeIds.join('|'), navigation:monaArrival.navigation, selected:'mona', floor:1};
assert.deepEqual(validStoredProgress(index, routes, stored)?.navigation, monaArrival.navigation, 'same-session reload restores progress');
assert.equal(validStoredProgress(index, routes, {...stored, routeSignature:'stale'}), null, 'changed route data invalidates stale progress');

for (const route of routes) {
  let progress = navigationStateFromRoute(index, route.ids);
  for (const [position, workId] of route.ids.entries()) {
    const before = buildNavigationView(index, progress);
    assert.equal(before.destinationNode.workId, workId, `${route.minutes} minute route target ${position + 1} must stay in visit order`);
    if (position < route.ids.length - 1) assert.ok(before.plannedSegments.length > 0, `${route.minutes} minute route must show later legs before work ${position + 1}`);
    const arrival = advanceOnRouteAudio(index, progress, route.ids, workId);
    assert.equal(arrival.updated, true, `${route.minutes} minute route must advance at ${workId}`);
    progress = arrival.navigation;
  }
  const completeView = buildNavigationView(index, progress);
  assert.equal(completeView.complete, true, `${route.minutes} minute route must finish at the final work`);
  assert.ok(completeView.passedSegments.length > 0, `${route.minutes} minute completed route must retain the full dotted history`);
  assert.deepEqual(completeView.plannedSegments, [], `${route.minutes} minute completed route must have no future leg`);
}

console.log('audio-linked route progress: passed');
