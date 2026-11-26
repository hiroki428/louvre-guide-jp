import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {floorGeoData} from '../src/floor-map-geo.js';
import {buildNavigationView, indexNavigationGraph, navigationStateForSelection, navigationStateFromRoute, shortestPath} from '../src/navigation.js';

const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

const preferenceGraph = indexNavigationGraph({
  nodes: [{id: 'start'}, {id: 'stairs'}, {id: 'goal'}],
  edges: [
    {from: 'start', to: 'goal', kind: 'elevator', cost: 1},
    {from: 'start', to: 'stairs', kind: 'stairs', cost: 2},
    {from: 'stairs', to: 'goal', kind: 'corridor', cost: 1}
  ]
});
assert.equal(shortestPath(preferenceGraph, 'start', 'goal').edges[0].kind, 'elevator');
assert.equal(shortestPath(preferenceGraph, 'start', 'goal', {preferElevator: false}).edges[0].kind, 'stairs');
assert.equal(shortestPath(preferenceGraph, 'start', 'goal', {preferElevator: true}).edges[0].kind, 'elevator');

const sameFloor = buildNavigationView(index, {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:mona'
});
assert.equal(sameFloor.available, true);
assert.deepEqual(sameFloor.routeFloors, [1]);
assert.equal(sameFloor.transitions.length, 0);
assert.match(sameFloor.nextAction, /711室/);
assert.ok(sameFloor.passedSegments.length > 0, 'passed route should be available');
assert.ok(sameFloor.remainingSegments.length > 0, 'remaining route should be available');
assert.ok(sameFloor.remainingSegments[0].points.length >= 3, 'the 703 to 711 route must follow real corridor waypoints');

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
assert.ok(threeFloorMove.transitions.every(transition => ['stairs', 'escalator', 'elevator'].includes(transition.kind)));
assert.deepEqual(new Set(threeFloorMove.routeFloors), new Set([2, 1, 0, -1]));

// Verified 1F <-> 2F local correspondence routing (Sully 635 <-> 917 uses Sully NE stairs directly, not Richelieu)
const sully1to2 = shortestPath(index, 'door:f1:635', 'door:f2:917');
assert.ok(sully1to2 && sully1to2.edges.some(e => e.facilityId === 'stairs-sully-ne'), 'Sully 635 to 917 should use Sully NE stairs');
const sully1to2Elev = shortestPath(index, 'door:f1:635', 'door:f2:917', {preferElevator: true});
assert.ok(sully1to2Elev && sully1to2Elev.edges.some(e => e.kind === 'elevator') && sully1to2Elev.edges.every(e => e.kind !== 'stairs' && e.kind !== 'escalator'), 'preferElevator between 1F and 2F must use an elevator and avoid stairs/escalator');

// Verified 0F <-> 1F local correspondence routing (Daru 703 -> Venus 345 uses Daru stairs; Denon 700 -> 403 uses Denon West stairs)
const daru1to0 = shortestPath(index, 'door:f1:703', 'door:f0:345');
assert.ok(daru1to0 && daru1to0.edges.some(e => e.facilityId === 'stairs-daru'), '703 to 345 should descend via Daru staircase');
const denonWest1to0 = shortestPath(index, 'door:f1:700', 'door:f0:403');
assert.ok(denonWest1to0 && denonWest1to0.edges.some(e => e.facilityId === 'stairs-denon-west'), '700 to 403 should descend via Denon West stairs');
const denonWest1to0Elev = shortestPath(index, 'door:f1:700', 'door:f0:403', {preferElevator: true});
assert.ok(denonWest1to0Elev && denonWest1to0Elev.edges.some(e => e.facilityId === 'ev-denon-west'), 'preferElevator 700 to 403 should use Denon West elevator');

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
assert.equal(secondSelection.remainingPath.nodeIds[0], 'work:victory');
assert.equal(secondSelection.remainingPath.nodeIds.at(-1), 'work:mona');
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

const preferElevPath = shortestPath(index, 'door:f1:703', 'work:venus', {preferElevator: true});
assert.ok(preferElevPath, 'elevator-priority route must be found on the full graph');
assert.ok(preferElevPath.edges.some(edge => edge.kind === 'elevator'), 'preferElevator should select elevator edges');
assert.ok(preferElevPath.edges.every(edge => edge.kind !== 'stairs'), 'preferElevator should avoid stairs when elevators are available');
const preferElevView = buildNavigationView(index, {
  journeyStartNodeId:'work:victory',
  currentNodeId:'door:f1:703',
  destinationNodeId:'work:venus'
}, {preferElevator: true});
assert.equal(preferElevView.transitions[0].kind, 'elevator');

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
  const fromEntrance = shortestPath(index, 'entrance:pyramid:fm2', workNode.id);
  assert.ok(fromEntrance, `${workNode.id} must be reachable from the pyramid entrance`);
}
assert.ok(graph.nodes.filter(node => node.type === 'artwork').length >= 57, 'deduplicated navigation graph should support at least 57 artworks');

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
  const visitedFloors = [];
  for (const id of route.ids) {
    const fl = index.nodes.get(`work:${id}`).floor;
    if (visitedFloors.at(-1) !== fl) {
      assert.equal(visitedFloors.includes(fl), false, `${route.id} must not revisit floor ${fl} (no vertical backtracking)`);
      visitedFloors.push(fl);
    }
  }
}

const verifiedLinkIds = new Set((floorGeoData.verticalLinks || []).map(link => link.id));
for (const edge of graph.edges) {
  const from = index.nodes.get(edge.from);
  const to = index.nodes.get(edge.to);
  if (from.floor !== to.floor) {
    assert.ok(['stairs','elevator','escalator'].includes(edge.kind), `${edge.from} to ${edge.to} must use a floor facility`);
    assert.ok(verifiedLinkIds.has(edge.facilityId), `${edge.from} to ${edge.to} (${edge.facilityId}) must be a verified verticalLink — never route through unverified/unknown-destination facilities`);
  }
  if (edge.kind === 'corridor' && Array.isArray(edge.via)) assert.ok(edge.via.every(point => point.length === 2 && point.every(Number.isFinite)), `${edge.from} corridor waypoints must be valid`);
}

console.log('navigation graph and Dijkstra: passed');
