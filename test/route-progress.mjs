import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNavigationView, indexNavigationGraph, navigationStateFromRoute} from '../src/navigation.js';
import {advanceOnRouteAudio, playbackModeFor, validStoredProgress} from '../src/route-progress.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);
const route90 = routes.find(route => route.kind !== 'theme' && route.minutes === 90);
const routeIds = route90.ids;
const [firstId, secondId, thirdId, fourthId] = routeIds;
const initial = navigationStateFromRoute(index, routeIds);

assert.equal(playbackModeFor(index, initial, firstId), 'route', 'the first work is the route target from the entrance');
assert.equal(playbackModeFor(index, initial, secondId), 'standalone', 'a later work is standalone until it becomes next');
assert.equal(playbackModeFor(index, initial, thirdId), 'standalone', 'a later work is standalone until it becomes next');

const beforeArrival = buildNavigationView(index, initial);
assert.equal(beforeArrival.currentNode.id, 'entrance:pyramid:fm2');
assert.equal(beforeArrival.destinationNode.workId, firstId);
assert.ok(beforeArrival.plannedSegments.length > 0, 'the full route after the next work remains visible');

const firstArrival = advanceOnRouteAudio(index, initial, routeIds, firstId);
assert.equal(firstArrival.updated, true);
assert.equal(firstArrival.navigation.currentNodeId, `work:${firstId}`);
assert.equal(firstArrival.navigation.destinationNodeId, `work:${secondId}`);
assert.deepEqual(firstArrival.previous, initial, 'undo snapshot preserves the exact entrance state');

const secondArrival = advanceOnRouteAudio(index, firstArrival.navigation, routeIds, secondId);
assert.equal(secondArrival.updated, true);
assert.equal(secondArrival.navigation.currentNodeId, `work:${secondId}`);
assert.equal(secondArrival.navigation.destinationNodeId, `work:${thirdId}`);
assert.equal(secondArrival.navigation.lastConfirmedWorkId, secondId);
assert.equal(secondArrival.navigation.passedNodeIds.at(-1), `work:${secondId}`);
assert.deepEqual(secondArrival.previous, firstArrival.navigation, 'undo snapshot preserves the exact previous progress');

const afterArrival = buildNavigationView(index, secondArrival.navigation);
assert.equal(afterArrival.destinationNode.workId, thirdId);
assert.ok(afterArrival.passedSegments.length >= beforeArrival.passedSegments.length, 'arrived route becomes passed history');
assert.notDeepEqual(afterArrival.remainingPath.nodeIds, beforeArrival.remainingPath.nodeIds, 'old unpassed plan is replaced');

const duplicateSecond = advanceOnRouteAudio(index, secondArrival.navigation, routeIds, secondId);
assert.equal(duplicateSecond.updated, false, 'resume or duplicate arrival cannot update twice');
assert.equal(duplicateSecond.reason, 'not-next-work');
const pastFirst = advanceOnRouteAudio(index, secondArrival.navigation, routeIds, firstId);
assert.equal(pastFirst.updated, false, 'past standalone playback cannot move the location backwards');

const thirdArrival = advanceOnRouteAudio(index, secondArrival.navigation, routeIds, thirdId);
assert.equal(thirdArrival.updated, true);
assert.equal(thirdArrival.navigation.currentNodeId, `work:${thirdId}`);
assert.equal(thirdArrival.navigation.destinationNodeId, `work:${fourthId}`);
assert.ok(thirdArrival.navigation.passedNodeIds.length > secondArrival.navigation.passedNodeIds.length, 'past route history is retained');

const shortRoute = ['victory', 'mona'];
const shortState = navigationStateFromRoute(index, shortRoute);
const shortFirstArrival = advanceOnRouteAudio(index, shortState, shortRoute, 'victory');
const completed = advanceOnRouteAudio(index, shortFirstArrival.navigation, shortRoute, 'mona');
assert.equal(completed.navigation.routeComplete, true);
assert.equal(completed.navigation.destinationNodeId, null);
assert.equal(buildNavigationView(index, completed.navigation).complete, true);

const stored = {version:2, routeId:route90.id, minutes:90, routeSignature:routeIds.join('|'), navigation:secondArrival.navigation, selected:secondId, floor:1};
assert.deepEqual(validStoredProgress(index, routes, stored)?.navigation, secondArrival.navigation, 'same-session reload restores progress');
assert.equal(validStoredProgress(index, routes, {...stored, routeSignature:'stale'}), null, 'changed route data invalidates stale progress');

for (const route of routes) {
  let progress = navigationStateFromRoute(index, route.ids);
  for (const [position, workId] of route.ids.entries()) {
    const before = buildNavigationView(index, progress);
    assert.equal(before.destinationNode.workId, workId, `${route.id} target ${position + 1} must stay in visit order`);
    const hasLaterRoom = route.ids.slice(position + 1).some(id => index.nodes.get(`work:${id}`)?.exitNodeId !== index.nodes.get(`work:${workId}`)?.exitNodeId);
    if (hasLaterRoom) assert.ok(before.plannedSegments.length > 0, `${route.id} must show later legs before work ${position + 1}`);
    const arrival = advanceOnRouteAudio(index, progress, route.ids, workId);
    assert.equal(arrival.updated, true, `${route.id} must advance at ${workId}`);
    progress = arrival.navigation;
  }
  const completeView = buildNavigationView(index, progress);
  assert.equal(completeView.complete, true, `${route.id} must finish at the final work`);
  assert.ok(completeView.passedSegments.length > 0, `${route.id} completed route must retain the full dotted history`);
  assert.deepEqual(completeView.plannedSegments, [], `${route.id} completed route must have no future leg`);
}

console.log('audio-linked route progress: passed');
