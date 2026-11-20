import {shortestPath} from './navigation.js';

export function toggleMyPlan(ids, workId) {
  const list = Array.isArray(ids) ? [...ids] : [];
  const index = list.indexOf(workId);
  if (index >= 0) {
    list.splice(index, 1);
    return {ids: list, added: false};
  }
  list.push(workId);
  return {ids: list, added: true};
}

export function moveMyPlanItem(ids, workId, delta) {
  const list = Array.isArray(ids) ? [...ids] : [];
  const index = list.indexOf(workId);
  if (index < 0) return list;
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return list;
}

export function removeMyPlanItem(ids, workId) {
  return (Array.isArray(ids) ? ids : []).filter(id => id !== workId);
}

export function routableWorkIds(navigationIndex, workIds) {
  if (!Array.isArray(workIds) || !navigationIndex?.nodes) return [];
  return workIds.filter(id => navigationIndex.nodes.has(`work:${id}`));
}

export function optimizeWorkOrder(navigationIndex, workIds, {preferElevator = false, startNodeId = 'entrance:pyramid:fm2'} = {}) {
  const input = Array.isArray(workIds) ? [...workIds] : [];
  if (input.length <= 1 || !navigationIndex?.nodes) {
    return {ids: input, changed: false, beforeCost: 0, afterCost: 0, savedPercent: 0};
  }
  const routable = [];
  const unmapped = [];
  for (const id of input) {
    if (navigationIndex.nodes.has(`work:${id}`)) routable.push(id);
    else unmapped.push(id);
  }
  if (routable.length <= 1) {
    return {ids: input, changed: false, beforeCost: 0, afterCost: 0, savedPercent: 0};
  }

  const distCache = new Map();
  const dist = (from, to) => {
    if (from === to) return 0;
    const key = `${from}=>${to}`;
    if (distCache.has(key)) return distCache.get(key);
    const path = shortestPath(navigationIndex, from, to, {preferElevator});
    const cost = path ? path.totalCost : 1e9;
    distCache.set(key, cost);
    return cost;
  };

  const hasStart = navigationIndex.nodes.has(startNodeId);
  const pathCostForIds = seq => {
    let total = 0;
    let prev = hasStart ? startNodeId : null;
    for (const id of seq) {
      const cur = `work:${id}`;
      if (prev) total += dist(prev, cur);
      prev = cur;
    }
    return total;
  };

  const beforeCost = pathCostForIds(routable);

  // Group works sharing the same room exit so co-located works stay together.
  const roomMap = new Map();
  for (const id of routable) {
    const node = navigationIndex.nodes.get(`work:${id}`);
    const groupKey = node?.exitNodeId || `work:${id}`;
    if (!roomMap.has(groupKey)) roomMap.set(groupKey, []);
    roomMap.get(groupKey).push(id);
  }
  const groups = [...roomMap.values()].map(ids => ({ids, rep: `work:${ids[0]}`}));
  const m = groups.length;

  let orderedGroups = groups;
  if (m > 1) {
    const startD = groups.map(g => (hasStart ? dist(startNodeId, g.rep) : 0));
    const D = Array.from({length: m}, (_, i) =>
      Array.from({length: m}, (_, j) => (i === j ? 0 : dist(groups[i].rep, groups[j].rep)))
    );

    if (m <= 14) {
      const N = 1 << m;
      const dp = new Float64Array(N * m).fill(1e18);
      const parent = new Int16Array(N * m).fill(-1);
      for (let i = 0; i < m; i += 1) dp[(1 << i) * m + i] = startD[i];
      for (let mask = 1; mask < N; mask += 1) {
        for (let u = 0; u < m; u += 1) {
          if (!(mask & (1 << u))) continue;
          const cur = dp[mask * m + u];
          if (cur >= 1e17) continue;
          for (let v = 0; v < m; v += 1) {
            if (mask & (1 << v)) continue;
            const nmask = mask | (1 << v);
            const cand = cur + D[u][v];
            if (cand < dp[nmask * m + v]) {
              dp[nmask * m + v] = cand;
              parent[nmask * m + v] = u;
            }
          }
        }
      }
      let bestLast = 0;
      let bestCost = 1e18;
      const full = N - 1;
      for (let i = 0; i < m; i += 1) {
        if (dp[full * m + i] < bestCost) {
          bestCost = dp[full * m + i];
          bestLast = i;
        }
      }
      const seq = [];
      let mask = full;
      let cur = bestLast;
      while (cur !== -1) {
        seq.push(cur);
        const prev = parent[mask * m + cur];
        mask ^= (1 << cur);
        cur = prev;
      }
      seq.reverse();
      orderedGroups = seq.map(i => groups[i]);
    } else {
      const seqCost = seq => {
        let total = startD[seq[0]];
        for (let i = 0; i < seq.length - 1; i += 1) total += D[seq[i]][seq[i + 1]];
        return total;
      };
      let bestSeq = null;
      let bestCost = 1e18;
      for (let first = 0; first < m; first += 1) {
        const rem = new Set(Array.from({length: m}, (_, i) => i));
        rem.delete(first);
        const seq = [first];
        let cur = first;
        while (rem.size) {
          let next = -1;
          let bestD = 1e18;
          for (const k of rem) {
            if (D[cur][k] < bestD) { bestD = D[cur][k]; next = k; }
          }
          seq.push(next);
          rem.delete(next);
          cur = next;
        }
        let improved = true;
        while (improved) {
          improved = false;
          for (let i = 0; i < seq.length - 1; i += 1) {
            for (let j = i + 1; j < seq.length; j += 1) {
              const cand = [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)];
              if (seqCost(cand) + 1e-6 < seqCost(seq)) {
                seq.splice(0, seq.length, ...cand);
                improved = true;
              }
            }
          }
        }
        const cost = seqCost(seq);
        if (cost < bestCost) {
          bestCost = cost;
          bestSeq = seq;
        }
      }
      orderedGroups = bestSeq.map(i => groups[i]);
    }
  }

  const optimizedRoutable = orderedGroups.flatMap(g => g.ids);
  const afterCost = pathCostForIds(optimizedRoutable);
  const finalIds = [...optimizedRoutable, ...unmapped];
  const changed = finalIds.some((id, idx) => id !== input[idx]);
  const savedPercent = beforeCost > 0 && afterCost < beforeCost
    ? Math.max(1, Math.round((1 - afterCost / beforeCost) * 100))
    : 0;
  return {
    ids: finalIds,
    changed,
    beforeCost: Math.round(beforeCost),
    afterCost: Math.round(afterCost),
    savedPercent
  };
}

export function formatMinutesLabel(minutes) {
  const rounded = Math.round(minutes * 2) / 2;
  return Number.isInteger(rounded) ? `${rounded}分` : `${rounded.toFixed(1)}分`;
}

export function planStopEstimates(plan, navigationIndex, {preferElevator = false} = {}) {
  const ids = plan?.ids || [];
  if (!ids.length) return {};
  const perVisit = plan.ids.length ? (plan.visitMinutes / plan.ids.length) : 6;
  const rawMoves = [];
  let fromNode = navigationIndex?.nodes?.has('entrance:pyramid:fm2') ? 'entrance:pyramid:fm2' : null;
  for (const id of ids) {
    const nodeId = `work:${id}`;
    if (fromNode && navigationIndex?.nodes?.has(nodeId)) {
      const path = shortestPath(navigationIndex, fromNode, nodeId, {preferElevator});
      rawMoves.push(path ? Math.max(2, path.totalCost) : 12);
      fromNode = nodeId;
    } else {
      rawMoves.push(10);
    }
  }
  const sumRaw = rawMoves.reduce((a, b) => a + b, 0) || 1;
  const targetWalk = plan.walkMinutes || Math.max(8, ids.length * 4);
  const result = {};
  let cumulative = 0;
  ids.forEach((id, idx) => {
    const moveMin = (rawMoves[idx] / sumRaw) * targetWalk;
    const viewMin = perVisit;
    cumulative += moveMin + viewMin;
    const rounded = Math.round(cumulative * 2) / 2;
    result[id] = {
      order: idx + 1,
      moveMinutes: Math.round(moveMin * 2) / 2,
      viewMinutes: Math.round(viewMin * 2) / 2,
      elapsedMinutes: rounded,
      elapsedLabel: `ここまで 約${formatMinutesLabel(rounded)}`
    };
  });
  return result;
}

export function activePlanMeta({planMode, routeId, minutes, routes, myPlanIds, navigationIndex, duration = 40}) {
  if (planMode === 'myplan') {
    const ids = Array.isArray(myPlanIds) ? myPlanIds : [];
    const routableIds = routableWorkIds(navigationIndex, ids);
    const visitMinutes = ids.length * 6;
    const walkMinutes = routableIds.length ? Math.max(8, routableIds.length * 5) : 0;
    const audioMinutes = Math.ceil((ids.length * duration) / 60);
    const bufferMinutes = ids.length ? Math.min(15, Math.ceil(ids.length * 1.5)) : 0;
    return {
      mode: 'myplan',
      id: 'myplan',
      kind: 'custom',
      label: 'マイプラン',
      subtitle: 'お気に入りで組んだ自分だけのルート',
      minutes: null,
      ids,
      routableIds,
      visitMinutes,
      walkMinutes,
      audioMinutes,
      bufferMinutes,
      estimatedMinutes: visitMinutes + walkMinutes + audioMinutes + bufferMinutes,
      isCustom: true
    };
  }
  const route = (routeId ? routes.find(item => item.id === routeId) : null)
    || routes.find(item => item.kind !== 'theme' && item.minutes === minutes)
    || routes.find(item => item.minutes === minutes)
    || routes[0];
  const ids = route ? route.ids : [];
  const visitPerWork = route?.visit ?? 6;
  const visitMinutes = ids.length * visitPerWork;
  const walkMinutes = route?.walk ?? 0;
  const audioMinutes = Math.ceil((ids.length * duration) / 60);
  const bufferMinutes = route?.buffer ?? 0;
  return {
    mode: 'preset',
    id: route?.id ?? `preset-${route?.minutes ?? 90}`,
    kind: route?.kind ?? 'time',
    label: route?.label ?? `${route?.minutes ?? 90}分コース`,
    subtitle: route?.subtitle ?? '',
    minutes: route?.minutes ?? 90,
    ids,
    routableIds: routableWorkIds(navigationIndex, ids),
    visitMinutes,
    walkMinutes,
    audioMinutes,
    bufferMinutes,
    estimatedMinutes: visitMinutes + walkMinutes + audioMinutes + bufferMinutes,
    isCustom: false
  };
}
