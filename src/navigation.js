import {getFloorNavName, getLang, t} from './i18n.js';

const floorLabel = (floor, lang = getLang()) => getFloorNavName(floor, lang);

export function indexNavigationGraph(graph) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  graph.edges.forEach((edge, index) => {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`navigation edge ${index} has an unknown node`);
    if (!Number.isFinite(edge.cost) || edge.cost < 0) throw new Error(`navigation edge ${index} has an invalid cost`);
    const forward = {...edge, edgeIndex:index, reversed:false};
    const reverse = {...edge, from:edge.to, to:edge.from, edgeIndex:index, reversed:true};
    adjacency.get(forward.from).push(forward);
    adjacency.get(reverse.from).push(reverse);
  });
  return {nodes, adjacency, graph};
}

function edgeWeight(edge, options) {
  if (options?.preferElevator) {
    if (edge.kind === 'stairs' || edge.kind === 'escalator') return edge.cost + 10000;
    if (edge.kind === 'elevator') return Math.max(1, edge.cost * 0.7);
  }
  return edge.cost;
}

export function shortestPath(graphOrIndex, startId, goalId, options = {}) {
  const index = graphOrIndex.nodes instanceof Map ? graphOrIndex : indexNavigationGraph(graphOrIndex);
  if (!index.nodes.has(startId) || !index.nodes.has(goalId)) return null;
  if (startId === goalId) return {nodeIds:[startId], edges:[], totalCost:0};

  const distance = new Map([...index.nodes.keys()].map(id => [id, Infinity]));
  const previous = new Map();
  const unvisited = new Set(index.nodes.keys());
  distance.set(startId, 0);

  while (unvisited.size) {
    let current = null;
    let best = Infinity;
    for (const id of unvisited) {
      if (distance.get(id) < best) { best = distance.get(id); current = id; }
    }
    if (current === null || best === Infinity) break;
    unvisited.delete(current);
    if (current === goalId) break;
    for (const edge of index.adjacency.get(current)) {
      if (edge.available === false || !unvisited.has(edge.to)) continue;
      const candidate = best + edgeWeight(edge, options);
      if (candidate < distance.get(edge.to)) {
        distance.set(edge.to, candidate);
        previous.set(edge.to, {nodeId:current, edge});
      }
    }
  }

  if (!previous.has(goalId)) return null;
  const nodeIds = [goalId];
  const edges = [];
  let cursor = goalId;
  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge);
    nodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }
  return {nodeIds, edges, totalCost:edges.reduce((sum, e) => sum + e.cost, 0)};
}

export function navigationStateFromRoute(graphOrIndex, workIds) {
  const index = graphOrIndex.nodes instanceof Map ? graphOrIndex : indexNavigationGraph(graphOrIndex);
  const workNodes = workIds.map(id => index.nodes.get(`work:${id}`)).filter(Boolean);
  const first = workNodes[0];
  const entrance = index.nodes.get('entrance:pyramid:fm2');
  if (!first) return {journeyStartNodeId:null, currentNodeId:null, destinationNodeId:null, routeWorkIds:[]};
  const start = entrance ?? first;
  return {
    journeyStartNodeId:start.id,
    currentNodeId:start.id,
    destinationNodeId:first.id,
    routeWorkIds:workNodes.map(node => node.workId),
    passedNodeIds:[start.id],
    passedNodeGroups:[[start.id]],
    lastConfirmedWorkId:null,
    lastConfirmedMethod:'route-start',
    routeComplete:false
  };
}

export function navigationStateForSelection(graphOrIndex, workIds, selectedWorkId, options = {}) {
  const index = graphOrIndex.nodes instanceof Map ? graphOrIndex : indexNavigationGraph(graphOrIndex);
  const base = navigationStateFromRoute(index, workIds);
  const selectedIndex = workIds.indexOf(selectedWorkId);
  if (selectedIndex < 0 || !base.currentNodeId) return base;

  const passedNodeGroups = [];
  let fromId = base.currentNodeId;
  for (const workId of workIds.slice(0, selectedIndex)) {
    const path = shortestPath(index, fromId, `work:${workId}`, options);
    if (!path) return base;
    passedNodeGroups.push(path.nodeIds);
    fromId = `work:${workId}`;
  }
  return {
    ...base,
    currentNodeId:fromId,
    destinationNodeId:`work:${selectedWorkId}`,
    passedNodeIds:passedNodeGroups.flat(),
    passedNodeGroups,
    lastConfirmedWorkId:selectedIndex > 0 ? workIds[selectedIndex - 1] : null,
    lastConfirmedMethod:selectedIndex > 0 ? 'selection' : 'route-start'
  };
}

function pathFromNodeIds(index, nodeIds) {
  if (!Array.isArray(nodeIds) || !nodeIds.length) return null;
  const edges = [];
  let totalCost = 0;
  for (let position = 0; position < nodeIds.length - 1; position += 1) {
    const edge = index.adjacency.get(nodeIds[position])?.find(candidate => candidate.to === nodeIds[position + 1] && candidate.available !== false);
    if (!edge) return null;
    edges.push(edge);
    totalCost += edge.cost;
  }
  return {nodeIds:[...nodeIds], edges, totalCost};
}

function edgePoints(index, path, edgeIndex) {
  const from = index.nodes.get(path.nodeIds[edgeIndex]);
  const to = index.nodes.get(path.nodeIds[edgeIndex + 1]);
  if (!from || !to || from.floor !== to.floor) return [];
  const edge = path.edges[edgeIndex];
  const via = Array.isArray(edge.via) ? (edge.reversed ? [...edge.via].reverse() : edge.via) : [];
  return [[from.x, from.y], ...via, [to.x, to.y]];
}

function floorSegments(index, path) {
  const segments = [];
  let current = null;
  for (let edgeIndex = 0; edgeIndex < path.edges.length; edgeIndex += 1) {
    const from = index.nodes.get(path.nodeIds[edgeIndex]);
    const to = index.nodes.get(path.nodeIds[edgeIndex + 1]);
    if (!from || !to || from.floor !== to.floor) {
      if (current?.points.length > 1) segments.push(current);
      current = null;
      continue;
    }
    const points = edgePoints(index, path, edgeIndex);
    if (!current || current.floor !== from.floor) {
      if (current?.points.length > 1) segments.push(current);
      current = {floor:from.floor, points:[], nodeIds:[path.nodeIds[edgeIndex]]};
    }
    points.forEach(point => {
      const previous = current.points.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) current.points.push(point);
    });
    current.nodeIds.push(path.nodeIds[edgeIndex + 1]);
  }
  if (current?.points.length > 1) segments.push(current);
  return segments;
}

function plannedPaths(index, routeWorkIds, destinationNode, options) {
  if (!destinationNode?.workId || !Array.isArray(routeWorkIds)) return [];
  const destinationIndex = routeWorkIds.indexOf(destinationNode.workId);
  if (destinationIndex < 0) return [];
  const paths = [];
  let fromId = destinationNode.id;
  for (const workId of routeWorkIds.slice(destinationIndex + 1)) {
    const toId = `work:${workId}`;
    const path = shortestPath(index, fromId, toId, options);
    if (!path) return [];
    paths.push(path);
    fromId = toId;
  }
  return paths;
}

function transitionSteps(index, path, lang = getLang()) {
  if (!path) return [];
  const transitions = [];
  for (let edgeIndex = 0; edgeIndex < path.edges.length; edgeIndex += 1) {
    const edge = path.edges[edgeIndex];
    const from = index.nodes.get(path.nodeIds[edgeIndex]);
    const to = index.nodes.get(path.nodeIds[edgeIndex + 1]);
    if (!from || !to || from.floor === to.floor) continue;
    const delta = to.floor - from.floor;
    const count = Math.abs(delta);
    const direction = delta > 0 ? t('nav.dirUp', null, lang) : t('nav.dirDown', null, lang);
    const defaultKindLabel = edge.kind === 'elevator'
      ? t('svg.fac.elevator', null, lang)
      : edge.kind === 'escalator'
        ? t('svg.fac.escalator', null, lang)
        : t('svg.fac.stairs', null, lang);
    const facilityName = lang === 'ja'
      ? (from.label || to.label || defaultKindLabel)
      : defaultKindLabel;
    const message = t('nav.transitionMsg', {facility: facilityName, count, dir: direction, floor: floorLabel(to.floor, lang)}, lang);
    transitions.push({kind:edge.kind, facilityName, from, to, message});
  }
  return transitions;
}

function nextAction(index, path, destination, lang = getLang()) {
  if (!path || path.nodeIds.length < 2) return destination ? t('nav.arrived', {label: destination.label}, lang) : t('nav.cannotCheck', null, lang);
  const current = index.nodes.get(path.nodeIds[0]);
  const next = index.nodes.get(path.nodeIds[1]);
  if (current.floor !== next.floor) {
    const transition = transitionSteps(index, path, lang)[0];
    return transition?.message ?? t('nav.moveToFloor', {floor: floorLabel(next.floor, lang)}, lang);
  }
  const dx = next.x - current.x;
  const dy = next.y - current.y;
  const direction = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? t('nav.right', null, lang) : t('nav.left', null, lang))
    : (dy >= 0 ? t('nav.downDir', null, lang) : t('nav.upDir', null, lang));
  const room = destination?.room ? t('location.room', {room: destination.room}, lang) : destination?.label;
  return t('nav.followBlue', {dir: direction, room}, lang);
}

export function buildNavigationView(graphOrIndex, input, options = {}) {
  const lang = options?.lang ?? getLang();
  const index = graphOrIndex.nodes instanceof Map ? graphOrIndex : indexNavigationGraph(graphOrIndex);
  const {journeyStartNodeId, currentNodeId, destinationNodeId} = input ?? {};
  const currentNode = index.nodes.get(currentNodeId) ?? null;
  const destinationNode = index.nodes.get(destinationNodeId) ?? null;
  const storedGroups = Array.isArray(input?.passedNodeGroups) ? input.passedNodeGroups : (Array.isArray(input?.passedNodeIds) ? [input.passedNodeIds] : []);
  const storedPassedPaths = storedGroups.map(group => pathFromNodeIds(index, group)).filter(Boolean);
  const fallbackPassedPath = !storedPassedPaths.length && journeyStartNodeId && currentNode ? shortestPath(index, journeyStartNodeId, currentNodeId, options) : null;
  const passedPaths = storedPassedPaths.length ? storedPassedPaths : (fallbackPassedPath ? [fallbackPassedPath] : []);
  const passedPath = passedPaths[0] ?? null;
  const passedSegments = passedPaths.flatMap(path => floorSegments(index, path));
  const passedTransitions = passedPaths.flatMap(path => transitionSteps(index, path, lang));
  if (currentNode && input?.routeComplete) {
    const floors = new Set([currentNode.floor]);
    passedSegments.forEach(segment => floors.add(segment.floor));
    passedTransitions.forEach(transition => { floors.add(transition.from.floor); floors.add(transition.to.floor); });
    return {available:true, complete:true, currentNode, destinationNode:null, locationMethod:input?.lastConfirmedMethod, passedPath, passedSegments, passedTransitions, remainingSegments:[], plannedSegments:[], transitions:[], plannedTransitions:[], routeFloors:[...floors], nextAction:t('nav.routeComplete', null, lang), totalCost:0};
  }
  if (!currentNode || !destinationNode) {
    return {available:false, reason:t('nav.noNodes', null, lang), passedSegments:[], remainingSegments:[], plannedSegments:[], transitions:[], plannedTransitions:[], routeFloors:[]};
  }

  const remainingPath = shortestPath(index, currentNodeId, destinationNodeId, options);
  if (!remainingPath) {
    return {available:false, reason:t('nav.noPath', null, lang), currentNode, destinationNode, locationMethod:input?.lastConfirmedMethod, passedSegments, passedTransitions, remainingSegments:[], plannedSegments:[], transitions:[], plannedTransitions:[], routeFloors:[currentNode.floor]};
  }

  const remainingSegments = floorSegments(index, remainingPath);
  const transitions = transitionSteps(index, remainingPath, lang);
  const futurePaths = plannedPaths(index, input?.routeWorkIds, destinationNode, options);
  const plannedSegments = futurePaths.flatMap(path => floorSegments(index, path));
  const plannedTransitions = futurePaths.flatMap(path => transitionSteps(index, path, lang));
  const floors = new Set([currentNode.floor, destinationNode.floor]);
  passedSegments.forEach(segment => floors.add(segment.floor));
  passedTransitions.forEach(transition => { floors.add(transition.from.floor); floors.add(transition.to.floor); });
  remainingSegments.forEach(segment => floors.add(segment.floor));
  transitions.forEach(transition => { floors.add(transition.from.floor); floors.add(transition.to.floor); });
  plannedSegments.forEach(segment => floors.add(segment.floor));
  plannedTransitions.forEach(transition => { floors.add(transition.from.floor); floors.add(transition.to.floor); });
  return {
    available:true,
    currentNode,
    destinationNode,
    locationMethod:input?.lastConfirmedMethod,
    passedPath,
    remainingPath,
    passedSegments,
    passedTransitions,
    remainingSegments,
    plannedSegments,
    transitions,
    plannedTransitions,
    routeFloors:[...floors],
    nextAction:nextAction(index, remainingPath, destinationNode, lang),
    totalCost:remainingPath.totalCost
  };
}
