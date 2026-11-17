import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNavigationView, indexNavigationGraph, navigationStateForSelection, navigationStateFromRoute, shortestPath} from '../src/navigation.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

const sameFloor = buildNavigationView(index, {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:mona'
});
assert.equal(sameFloor.available, true);
assert.deepEqual(sameFloor.routeFloors, [1]);
assert.equal(sameFloor.transitions.length, 0);
assert.match(sameFloor.nextAction, /右/);
assert.match(sameFloor.nextAction, /711室/);
assert.ok(sameFloor.passedSegments.length > 0, 'passed route should be available');
assert.ok(sameFloor.remainingSegments.length > 0, 'remaining route should be available');
assert.ok(sameFloor.remainingSegments[0].points.some(([x, y]) => x === 433 && y === 421), 'the 703 to 711 route must turn onto the mapped lower corridor');
assert.ok(sameFloor.remainingSegments[0].points.some(([x, y]) => x === 672 && y === 397), 'the 703 to 711 route must enter room 711 from its mapped connection');

const multipleFloors = buildNavigationView(index, {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:venus'
});
assert.equal(multipleFloors.available, true);
assert.deepEqual(new Set(multipleFloors.routeFloors), new Set([1, 0]));
assert.equal(multipleFloors.transitions.length, 1);
assert.equal(multipleFloors.transitions[0].kind, 'stairs');
assert.match(multipleFloors.transitions[0].message, /1階下へ/);

const threeFloorMove = buildNavigationView(index, {
  journeyStartNodeId:'work:lacemaker',
  currentNodeId:'door:f2:837',
  destinationNodeId:'work:marly'
});
assert.equal(threeFloorMove.transitions.length, 3);
assert.ok(threeFloorMove.transitions.every(transition => transition.kind === 'stairs'));
assert.deepEqual(new Set(threeFloorMove.routeFloors), new Set([2, 1, 0, -1]));

const routeState = navigationStateFromRoute(index, ['victory', 'mona', 'venus']);
assert.deepEqual(routeState, {
  journeyStartNodeId:'entrance:pyramid:fm2',
  currentNodeId:'entrance:pyramid:fm2',
  destinationNodeId:'work:victory',
  routeWorkIds:['victory','mona','venus'],
  passedNodeIds:['entrance:pyramid:fm2'],
  passedNodeGroups:[['entrance:pyramid:fm2']],
  lastConfirmedWorkId:null,
  lastConfirmedMethod:'route-start',
  routeComplete:false
});

const selectionRoute = ['victory','mona','liberty','venus'];
const firstSelection = buildNavigationView(index, navigationStateForSelection(index, selectionRoute, 'victory'));
assert.equal(firstSelection.currentNode.id, 'entrance:pyramid:fm2');
assert.equal(firstSelection.destinationNode.workId, 'victory');
assert.equal(firstSelection.passedSegments.length, 0, 'first selection has no passed leg');
assert.ok(firstSelection.remainingSegments.length > 0, 'entrance to first work is active');

const secondSelection = buildNavigationView(index, navigationStateForSelection(index, selectionRoute, 'mona'));
assert.equal(secondSelection.currentNode.workId, 'victory');
assert.equal(secondSelection.destinationNode.workId, 'mona');
assert.ok(secondSelection.passedSegments.length > 0, 'entrance to first work is passed');
assert.deepEqual(secondSelection.remainingPath.nodeIds, ['work:victory','door:f1:703','door:f1:711','work:mona']);
assert.ok(secondSelection.plannedSegments.length > 0, 'second work to final work remains planned');

const thirdSelection = buildNavigationView(index, navigationStateForSelection(index, selectionRoute, 'liberty'));
assert.equal(thirdSelection.currentNode.workId, 'mona');
assert.equal(thirdSelection.destinationNode.workId, 'liberty');
assert.ok(thirdSelection.passedSegments.length >= secondSelection.passedSegments.length, 'all earlier legs remain passed');
assert.ok(thirdSelection.plannedSegments.length > 0, 'later legs remain planned');

const elevatorGraph = structuredClone(graph);
elevatorGraph.edges.forEach(edge => { if (edge.kind === 'stairs') edge.available = false; });
const elevatorPath = shortestPath(elevatorGraph, 'door:f1:703', 'work:venus');
assert.ok(elevatorPath);
assert.ok(elevatorPath.edges.some(edge => edge.kind === 'elevator'), 'elevator remains a connected alternative');
const elevatorView = buildNavigationView(indexNavigationGraph(elevatorGraph), {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:venus'
});
assert.equal(elevatorView.transitions[0].kind, 'elevator');
assert.match(elevatorView.transitions[0].message, /エレベーター/);

const unavailable = buildNavigationView(index, {
  journeyStartNodeId:'unknown',
  currentNodeId:'unknown',
  destinationNodeId:'work:mona'
});
assert.equal(unavailable.available, false);
assert.deepEqual(unavailable.remainingSegments, []);

const disconnectedGraph = structuredClone(graph);
disconnectedGraph.edges.forEach(edge => {
  if (edge.from === 'work:mona' || edge.to === 'work:mona') edge.available = false;
});
const disconnected = buildNavigationView(disconnectedGraph, {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:mona'
});
assert.equal(disconnected.available, false);
assert.match(disconnected.reason, /経路がありません/);

for (const workNode of graph.nodes.filter(node => node.type === 'artwork')) {
  assert.ok(index.nodes.has(workNode.exitNodeId), `${workNode.id} needs a mapped room exit`);
}

for (const route of routes) {
  const initialPath = shortestPath(index, 'entrance:pyramid:fm2', `work:${route.ids[0]}`);
  assert.ok(initialPath, `entrance to ${route.ids[0]} needs a connected route`);
  assert.ok(initialPath.edges.some(edge => edge.kind === 'stairs' || edge.kind === 'elevator'), `entrance to ${route.ids[0]} must use a mapped floor connection`);
  for (let position = 0; position < route.ids.length - 1; position += 1) {
    const from = index.nodes.get(`work:${route.ids[position]}`);
    const to = `work:${route.ids[position + 1]}`;
    assert.ok(from, `${route.ids[position]} needs a graph node`);
    assert.ok(shortestPath(index, from.exitNodeId, to), `${route.ids[position]} to ${route.ids[position + 1]} needs a connected route`);
  }
  const fullView = buildNavigationView(index, navigationStateFromRoute(index, route.ids));
  assert.equal(fullView.destinationNode.workId, route.ids[0], `${route.minutes} minute route must target its first work from the entrance`);
  assert.ok(fullView.plannedSegments.length > 0, `${route.minutes} minute route must retain all later legs`);
  assert.equal(fullView.routeFloors.includes(-2), true, `${route.minutes} minute route must display the entrance floor`);
}

for (const edge of graph.edges) {
  const from = index.nodes.get(edge.from);
  const to = index.nodes.get(edge.to);
  if (from.floor !== to.floor) assert.ok(['stairs','elevator','escalator'].includes(edge.kind), `${edge.from} to ${edge.to} must use a floor facility`);
  if (edge.kind === 'corridor' && Array.isArray(edge.via)) assert.ok(edge.via.every(point => point.length === 2 && point.every(Number.isFinite)), `${edge.from} corridor waypoints must be valid`);
}

console.log('navigation graph and Dijkstra: passed');
