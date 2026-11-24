import {floorGeoData} from './floor-map-geo.js';

const BASE_VIEW = Object.freeze({...floorGeoData.meta.viewBox});
const MIN_VIEW_WIDTH = 280;
// Artwork pins are drawn PIN_SCALE times their original size so their numbers are a little larger than
// room numbers (they grow with the map like room numbers do). Rooms whose pins would overlap are drawn as one
// "N件" group; tapping a group fans its pins out around it ("spider"), without zooming.
const PIN_SCALE = 1.3;
const CLUSTER_DISTANCE = 22;
// The zoom/pan of each floor survives re-renders (e.g. opening and closing a work's detail sheet).
const savedViews = new Map();
// Builds the fanned-out pins of a group of the last rendered map (index = data-cluster).
let spiderBuilders = [];
const floorName = floor => ({2:'2階', 1:'1階', 0:'0階', '-1':'−1階', '-2':'−2階'}[floor] ?? `${floor}階`);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function pickPrimaryWork(roomWorks, selectedId, routeWorkIds) {
  const bySelected = roomWorks.find(work => work.id === selectedId);
  if (bySelected) return bySelected;
  if (Array.isArray(routeWorkIds)) {
    const byRoute = roomWorks.find(work => routeWorkIds.includes(work.id));
    if (byRoute) return byRoute;
  }
  return roomWorks[0];
}

function roomMarkup(room, worksByRoom, selectedId, routeWorkSet) {
  const roomWorks = room.number ? (worksByRoom.get(room.number) || []) : [];
  const selected = roomWorks.some(work => work.id === selectedId);
  const onRoute = routeWorkSet ? roomWorks.some(work => routeWorkSet.has(work.id)) : false;
  const roomAttr = room.number ? ` data-room="${escapeHtml(room.number)}"` : '';
  const constructionCls = room.underConstruction ? 'is-construction ' : '';
  const exhibitionCls = room.isExhibition ? 'is-exhibition ' : '';
  const shape = room.path
    ? `<path d="${room.path}" fill-rule="evenodd"/>`
    : `<polygon points="${room.points}"/>`;
  return `<g class="room-node ${constructionCls}${exhibitionCls}${selected ? 'is-selected ' : ''}${onRoute ? 'has-route-work ' : ''}wing-${escapeHtml(room.wing)}"${roomAttr}>${shape}</g>`;
}

function boxesOverlap(a, b, pad = 1.5) {
  return !(a.x1 + pad <= b.x0 || a.x0 - pad >= b.x1 || a.y1 + pad <= b.y0 || a.y0 - pad >= b.y1);
}

function overlapArea(a, b) {
  const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return ox * oy;
}

function markerBoxAt(x, y, kind) {
  const k = PIN_SCALE;
  if (kind === 'dest') return {x0: x - 11.5 * k, y0: y - 31.5 * k, x1: x + 11.5 * k, y1: y + 1 * k};
  if (kind === 'route') return {x0: x - 9.5 * k, y0: y - 26.5 * k, x1: x + 9.5 * k, y1: y + 1 * k};
  if (kind === 'viewed') return {x0: x - 9.8 * k, y0: y - 16 * k, x1: x + 9.8 * k, y1: y + 4 * k};
  if (kind === 'cluster') return {x0: x - 16.5, y0: y - 12, x1: x + 16.5, y1: y + 12};
  return {x0: x - 5.2 * k, y0: y - 5.2 * k, x1: x + 5.2 * k, y1: y + 5.2 * k};
}

function resolveNonOverlappingPinPos(ax, ay, kind, labelBoxes, placedPinBoxes) {
  const candidates = kind === 'catalog'
    ? [
        [0, -11], [15, 0], [-15, 0], [0, 12],
        [14, -9], [-14, -9], [14, 10], [-14, 10],
        [19, 0], [-19, 0], [0, -16], [0, 17],
        [20, -10], [-20, -10], [20, 10], [-20, 10]
      ]
    : kind === 'viewed'
      ? [
          [0, -13], [17, 4], [-17, 4], [18, -8], [-18, -8],
          [0, 19], [22, 4], [-22, 4], [22, -10], [-22, -10],
          [16, 17], [-16, 17], [0, -21], [26, 0], [-26, 0]
        ]
      : [
          [0, -10], [17, 6], [-17, 6], [19, -4], [-19, -4],
          [22, 8], [-22, 8], [0, -16], [22, -8], [-22, -8],
          [16, 22], [-16, 22], [26, 4], [-26, 4], [0, 32],
          [28, -6], [-28, -6], [28, 12], [-28, 12]
        ];

  // Pins are PIN_SCALE times larger than the offsets were designed for, so move them that much further.
  const offsets = candidates.map(([dx, dy]) => [dx * PIN_SCALE, dy * PIN_SCALE]);
  let best = {x: ax, y: ay, score: Infinity, box: markerBoxAt(ax, ay, kind)};
  for (const [dx, dy] of offsets) {
    const cx = Math.round((ax + dx) * 10) / 10;
    const cy = Math.round((ay + dy) * 10) / 10;
    const box = markerBoxAt(cx, cy, kind);
    let labelPen = 0;
    for (const lb of labelBoxes) {
      if (boxesOverlap(box, lb, 1.5)) labelPen += 1000 + overlapArea(box, lb) * 50;
    }
    let pinPen = 0;
    for (const pb of placedPinBoxes) {
      if (boxesOverlap(box, pb, 0.5)) pinPen += 120 + overlapArea(box, pb) * 8;
    }
    const distPen = Math.hypot(dx, dy) * 0.6;
    const score = labelPen + pinPen + distPen;
    if (score < best.score) {
      best = {x: cx, y: cy, score, box};
      if (labelPen === 0 && pinPen === 0) break;
    }
  }
  return best;
}

// Group rooms whose pins would sit on top of each other. The destination is never grouped.
function clusterPinItems(items, threshold) {
  const groups = [];
  for (const item of items) {
    let target = null;
    if (!item.destination) {
      let bestDistance = Infinity;
      for (const group of groups) {
        if (group.locked) continue;
        const distance = Math.hypot(group.cx - item.anchor.x, group.cy - item.anchor.y);
        if (distance <= threshold && distance < bestDistance) {
          bestDistance = distance;
          target = group;
        }
      }
    }
    if (target) {
      target.items.push(item);
      const n = target.items.length;
      target.cx += (item.anchor.x - target.cx) / n;
      target.cy += (item.anchor.y - target.cy) / n;
    } else {
      groups.push({items: [item], cx: item.anchor.x, cy: item.anchor.y, locked: item.destination});
    }
  }
  return groups;
}

function clusterMarkup(group, index, x, y) {
  const groupWorks = group.items.flatMap(item => item.roomWorks);
  const count = groupWorks.length;
  const hasRoute = group.items.some(item => item.kind === 'route' || item.kind === 'viewed');
  const allViewed = group.items.every(item => item.kind === 'viewed');
  const tone = allViewed ? 'is-cluster-viewed' : hasRoute ? 'is-cluster-route' : 'is-cluster-catalog';
  const rooms = group.items.map(item => item.roomNum).join('・');
  const label = `${count}件`;
  const width = 12 + label.length * 7.5;
  return `<g class="artwork-marker artwork-cluster ${tone}" transform="translate(${x} ${y})" data-pin-kind="cluster" data-pin-pos="${x},${y}" data-map-work="${escapeHtml(group.items[0].primary.id)}" data-room-works="${escapeHtml(groupWorks.map(work => work.id).join(','))}" data-cluster="${index}" tabindex="0" role="button" aria-expanded="false" aria-label="${escapeHtml(`${rooms}室の${count}作品。タップで広げる`)}"><rect class="artwork-hit" x="-18" y="-14" width="36" height="28" rx="14"/><rect class="cluster-halo" x="${-width / 2 - 3}" y="-13" width="${width + 6}" height="26" rx="13"/><rect class="cluster-bubble" x="${-width / 2}" y="-10" width="${width}" height="20" rx="10"/><text class="cluster-count" x="0" y="3.8" text-anchor="middle">${label}</text></g>`;
}

// The fanned-out pins of a group: each room's pin on a circle around the group, with a dotted line to the
// room's real position.
function spiderMarkup(group, x, y, pinOf) {
  const n = group.items.length;
  // Pins hang above their tip (about 34 map units tall), so the circle of tips is centred a little below
  // the group: the pin bodies then ring the "N件" marker instead of covering it.
  // Clamp the fan centre inside BASE_VIEW so edge clusters (e.g. East Sully x=916) never clip outside the SVG.
  const radius = Math.max(46, n * 9);
  const cx = Math.min(Math.max(x, radius + 18), BASE_VIEW.width - radius - 18);
  const cy = Math.min(Math.max(y + 17, radius + 42), BASE_VIEW.height - radius - 12);
  const legs = [];
  const pins = [];
  group.items.forEach((item, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const px = Math.round((cx + radius * Math.cos(angle)) * 10) / 10;
    const py = Math.round((cy + radius * Math.sin(angle)) * 10) / 10;
    legs.push(`<line class="spider-leg" x1="${px}" y1="${py}" x2="${item.anchor.x}" y2="${item.anchor.y}"/><circle class="spider-room" cx="${item.anchor.x}" cy="${item.anchor.y}" r="2.4"/>`);
    pins.push(pinOf(item, px, py));
  });
  return `<g class="map-spider" data-spider-pins>${legs.join('')}${pins.join('')}</g>`;
}

// For tests and the map wiring: the fanned-out pins of group `index` of the last rendered map.
export function clusterSpiderMarkup(index) {
  return spiderBuilders[index]?.() ?? '';
}

function artworkMarkup(anchors, worksByRoom, selectedId, routeWorkIds, viewedSet, labelBoxes = []) {
  const routeOrder = new Map();
  if (Array.isArray(routeWorkIds)) {
    routeWorkIds.forEach((id, idx) => routeOrder.set(id, idx + 1));
  }
  const routeSet = routeOrder.size ? new Set(routeWorkIds) : null;
  const parts = [];
  const placedPinBoxes = [];
  const sortedEntries = [...worksByRoom.entries()].sort(([, a], [, b]) => {
    const aDest = a.some(w => w.id === selectedId) ? 2 : (routeSet && a.some(w => routeSet.has(w.id)) ? 1 : 0);
    const bDest = b.some(w => w.id === selectedId) ? 2 : (routeSet && b.some(w => routeSet.has(w.id)) ? 1 : 0);
    return bDest - aDest;
  });

  const items = [];
  for (const [roomNum, roomWorks] of sortedEntries) {
    const anchor = anchors[roomNum];
    if (!anchor || !roomWorks.length) continue;
    const primary = pickPrimaryWork(roomWorks, selectedId, routeWorkIds);
    const destination = primary.id === selectedId;
    const onRoute = !routeSet || roomWorks.some(work => routeSet.has(work.id));
    const routeWorksInRoom = routeSet ? roomWorks.filter(w => routeSet.has(w.id)) : roomWorks;
    const allViewed = viewedSet && routeWorksInRoom.length > 0 && routeWorksInRoom.every(w => viewedSet.has(w.id));
    const orderNum = routeOrder.get(primary.id) || (routeWorksInRoom[0] ? routeOrder.get(routeWorksInRoom[0].id) : null);
    const kind = destination ? 'dest' : (onRoute && allViewed) ? 'viewed' : onRoute ? 'route' : 'catalog';
    items.push({roomNum, roomWorks, anchor, primary, destination, onRoute, allViewed, orderNum, kind});
  }

  // One room's pin (same look and rules as before, drawn PIN_SCALE times larger).
  const pinOf = (item, x, y) => {
    const {roomWorks, primary, destination, onRoute, allViewed, orderNum, kind} = item;
    const count = roomWorks.length;
    const idsAttr = roomWorks.map(work => work.id).join(',');
    const extraLabel = count > 1 ? `ほか${count - 1}作品` : '';
    const statusLabel = destination ? '次の目的地、' : allViewed ? '鑑賞済み、' : '';
    const ariaLabel = `${statusLabel}${primary.title}${extraLabel ? `（${extraLabel}）` : ''}、${primary.room}室`;

    let shapeMarkup = '';
    let badgeX = 9;
    let badgeY = -20;

    if (destination) {
      shapeMarkup = `
        <circle class="destination-pulse" cx="0" cy="0" r="14"/>
        <circle class="artwork-hit" cx="0" cy="-10" r="18"/>
        <path class="artwork-pin pin-drop pin-dest" d="M0 0 C-7.5 -8.5 -11 -14.5 -11 -20.5 A11 11 0 1 1 11 -20.5 C11 -14.5 7.5 -8.5 0 0 Z"/>
        <circle class="artwork-pin-core" cx="0" cy="-20.5" r="5.5"/>
        <text class="pin-glyph pin-glyph-dest" x="0" y="-17.5" text-anchor="middle">${orderNum ? orderNum : '★'}</text>
      `;
      badgeX = 11;
      badgeY = -29;
    } else if (onRoute && allViewed) {
      shapeMarkup = `
        <circle class="artwork-hit" cx="0" cy="-6" r="16"/>
        <circle class="artwork-pin pin-viewed" cx="0" cy="-6" r="9.5"/>
        <circle class="artwork-pin-core pin-core-viewed" cx="0" cy="-6" r="2.2"/>
        <path class="pin-check" d="M-4 -6 L-1.2 -3.2 L4.4 -9"/>
      `;
      badgeX = 9;
      badgeY = -14;
    } else if (onRoute) {
      shapeMarkup = `
        <circle class="artwork-hit" cx="0" cy="-8" r="16"/>
        <path class="artwork-pin pin-drop pin-route" d="M0 0 C-6.2 -7 -9.2 -12 -9.2 -17 A9.2 9.2 0 1 1 9.2 -17 C9.2 -12 6.2 -7 0 0 Z"/>
        <circle class="artwork-pin-core" cx="0" cy="-17" r="4.8"/>
        <text class="pin-glyph" x="0" y="-14.4" text-anchor="middle">${orderNum ?? '●'}</text>
      `;
      badgeX = 9.5;
      badgeY = -24;
    } else {
      shapeMarkup = `
        <circle class="artwork-hit" cx="0" cy="0" r="14"/>
        <circle class="artwork-pin pin-catalog" cx="0" cy="0" r="5"/>
        <circle class="artwork-pin-core" cx="0" cy="0" r="1.8"/>
      `;
      badgeX = 5.8;
      badgeY = -5.8;
    }

    const countBadge = count > 1
      ? `<circle class="artwork-count-bg" cx="${badgeX}" cy="${badgeY}" r="5.8"/><text class="artwork-count-text" x="${badgeX}" y="${badgeY + 2.5}" text-anchor="middle">${count}</text>`
      : '';

    const stateClasses = [
      'artwork-marker',
      destination ? 'is-selected is-destination' : '',
      onRoute ? 'is-route-work' : 'is-catalog-work',
      allViewed ? 'is-viewed' : ''
    ].filter(Boolean).join(' ');

    return `<g class="${stateClasses}" transform="translate(${x} ${y}) scale(${PIN_SCALE})" data-pin-kind="${kind}" data-pin-pos="${x},${y}" data-map-work="${escapeHtml(primary.id)}" data-room-works="${escapeHtml(idsAttr)}" tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">${shapeMarkup}${countBadge}</g>`;
  };

  const placedMarkers = [];
  spiderBuilders = [];
  for (const group of clusterPinItems(items, CLUSTER_DISTANCE)) {
    if (group.items.length > 1) {
      const pos = labelBoxes.length
        ? resolveNonOverlappingPinPos(group.cx, group.cy, 'cluster', labelBoxes, placedPinBoxes)
        : {x: group.cx, y: group.cy, box: markerBoxAt(group.cx, group.cy, 'cluster')};
      placedPinBoxes.push(pos.box);
      const index = spiderBuilders.length;
      spiderBuilders.push(() => spiderMarkup(group, pos.x, pos.y, pinOf));
      const zOrder = group.items.some(item => item.kind === 'route' || item.kind === 'viewed') ? 2 : 1;
      placedMarkers.push({zOrder, markup: clusterMarkup(group, index, pos.x, pos.y)});
      continue;
    }
    const item = group.items[0];
    const pos = labelBoxes.length
      ? resolveNonOverlappingPinPos(item.anchor.x, item.anchor.y, item.kind, labelBoxes, placedPinBoxes)
      : {x: item.anchor.x, y: item.anchor.y, box: markerBoxAt(item.anchor.x, item.anchor.y, item.kind)};
    placedPinBoxes.push(pos.box);
    const zOrder = item.destination ? 3 : item.onRoute ? 2 : 1;
    placedMarkers.push({zOrder, markup: pinOf(item, pos.x, pos.y)});
  }
  placedMarkers.sort((a, b) => a.zOrder - b.zOrder);
  for (const m of placedMarkers) parts.push(m.markup);
  return parts.join('');
}

const ALWAYS_VISIBLE_FACILITY_TYPES = new Set([
  'elevator',
  'escalator',
  'stairs-up',
  'stairs-down',
  'stairs-both',
  'stairs'
]);

function facilityBadgeGraphic(type) {
  switch (type) {
    case 'elevator':
      return `<rect class="fac-badge-bg fac-bg-elevator" x="-6.6" y="-6.2" width="13.2" height="12.4" rx="2.6"/><text class="fac-glyph-code" x="0" y="2.5" text-anchor="middle">EV</text>`;
    case 'escalator':
      return `<rect class="fac-badge-bg fac-bg-escalator" x="-7.6" y="-5.6" width="15.2" height="11.2" rx="5.6"/><text class="fac-glyph-code" x="0" y="2.5" text-anchor="middle">ES</text>`;
    case 'stairs-up':
      return `<path class="fac-badge-bg fac-bg-stairs-up" d="M0 -7.8 L6.6 -1.4 L6.6 5.0 Q6.6 6.4 5.2 6.4 L-5.2 6.4 Q-6.6 6.4 -6.6 5.0 L-6.6 -1.4 Z"/><path class="fac-glyph-fill" d="M0 -3.9 L3.7 0.7 H1.4 V4.0 H-1.4 V0.7 H-3.7 Z"/>`;
    case 'stairs-down':
      return `<path class="fac-badge-bg fac-bg-stairs-down" d="M-5.2 -6.4 L5.2 -6.4 Q6.6 -6.4 6.6 -5.0 L6.6 1.4 L0 7.8 L-6.6 1.4 L-6.6 -5.0 Q-6.6 -6.4 -5.2 -6.4 Z"/><path class="fac-glyph-fill" d="M0 3.9 L3.7 -0.7 H1.4 V-4.0 H-1.4 V-0.7 H-3.7 Z"/>`;
    case 'stairs-both':
      return `<rect class="fac-badge-bg fac-bg-stairs-both" x="-5.8" y="-7.4" width="11.6" height="14.8" rx="5.8"/><line class="fac-both-divider" x1="-5.2" y1="0" x2="5.2" y2="0"/><path class="fac-glyph-fill" d="M0 -5.6 L3.1 -1.5 H-3.1 Z M0 5.6 L3.1 1.5 H-3.1 Z"/>`;
    case 'stairs':
      return `<circle class="fac-badge-bg fac-bg-stairs" r="6.0"/><path class="fac-glyph-stroke" d="M-3.5 3.0h2.1V1h2.1v-2.0h2.1V-3.0h0.9"/>`;
    case 'wc':
      return `<circle class="fac-badge-bg fac-bg-wc" r="6.3"/><circle class="fac-glyph-fill" cx="-2.1" cy="-2.4" r="1.05"/><path class="fac-glyph-stroke" d="M-2.1 -0.8v3.9M-3.3 0.7h2.4"/><circle class="fac-glyph-fill" cx="2.1" cy="-2.4" r="1.05"/><path class="fac-glyph-stroke" d="M2.1 -0.8l-1.3 2.7h2.6l-1.3-2.7M2.1 1.9v1.3"/>`;
    case 'information':
      return `<circle class="fac-badge-bg fac-bg-information" r="6.3"/><circle class="fac-glyph-fill" cx="0" cy="-2.4" r="1.05"/><path class="fac-glyph-stroke" d="M0 -0.4v3.4M-1.2 3h2.4"/>`;
    case 'ticket':
      return `<circle class="fac-badge-bg fac-bg-ticket" r="6.3"/><text class="fac-glyph-letter" x="0" y="2.8" text-anchor="middle">T</text>`;
    case 'shop':
      return `<circle class="fac-badge-bg fac-bg-shop" r="6.3"/><text class="fac-glyph-letter" x="0" y="2.8" text-anchor="middle">S</text>`;
    case 'metro':
      return `<circle class="fac-badge-bg fac-bg-metro" r="6.3"/><text class="fac-glyph-letter" x="0" y="2.8" text-anchor="middle">M</text>`;
    case 'parking':
      return `<circle class="fac-badge-bg fac-bg-parking" r="6.3"/><text class="fac-glyph-letter" x="0" y="2.8" text-anchor="middle">P</text>`;
    case 'cafe':
      return `<circle class="fac-badge-bg fac-bg-cafe" r="6.3"/><path class="fac-glyph-stroke" d="M-3.2-1.8h4.8v2.8a2.2 2.2 0 0 1-2.2 2.2h-.4a2.2 2.2 0 0 1-2.2-2.2v-2.8Zm4.8.5h1.1a1.1 1.1 0 0 1 0 2.2h-1.1"/>`;
    default:
      return `<circle class="fac-badge-bg fac-bg-${escapeHtml(type)}" r="6.3"/><circle class="fac-glyph-fill" r="2"/>`;
  }
}

function facilityIconMarkup(item, facilityFilter) {
  const isPicked = (facilityFilter === 'wc' && item.type === 'wc') || (facilityFilter === 'cafe' && item.type === 'cafe');
  const isAlwaysVisible = ALWAYS_VISIBLE_FACILITY_TYPES.has(item.type);
  const isDimmed = facilityFilter && facilityFilter !== 'none' && !isPicked && !isAlwaysVisible;
  const scale = isPicked ? 1.42 : 1;
  const common = `transform="translate(${item.x} ${item.y}) scale(${scale})"`;
  const pickRing = isPicked ? `<circle class="facility-pick-bg pick-${escapeHtml(item.type)}" r="8.6"/>` : '';
  const labels = {
    wc: 'トイレ',
    elevator: 'エレベーター',
    stairs: '同階階段',
    'stairs-down': '下り階段',
    'stairs-up': '上り階段',
    'stairs-both': '上下階段',
    escalator: 'エスカレーター',
    information: '案内所',
    ticket: 'チケット売り場',
    shop: 'ショップ',
    metro: 'メトロ',
    parking: 'パーキング',
    cafe: item.label || 'カフェ'
  };
  const ariaLabel = labels[item.type] || item.label || item.type;
  const linkAttr = item.linkId ? ` data-vertical-link="${escapeHtml(item.linkId)}"` : '';
  return `<g class="facility facility-badge facility-${escapeHtml(item.type)} ${isPicked ? 'is-picked' : ''} ${isDimmed ? 'is-dimmed' : ''}" ${common} data-facility-type="${escapeHtml(item.type)}"${linkAttr} aria-label="${escapeHtml(ariaLabel)}">${pickRing}${facilityBadgeGraphic(item.type)}</g>`;
}

const polylineMarkup = (segments, floor, className) => segments
  .filter(segment => segment.floor === floor)
  .map(segment => `<polyline class="${className}" points="${segment.points.map(point => point.join(',')).join(' ')}"/>`)
  .join('');

function routeLayerMarkup(floor, navigation) {
  if (!navigation) return '';
  const passed = polylineMarkup(navigation.passedSegments ?? [], floor, 'route-passed');
  const activeCasing = polylineMarkup(navigation.remainingSegments ?? [], floor, 'route-active-casing');
  const active = polylineMarkup(navigation.remainingSegments ?? [], floor, 'route-active');
  const currentLabel = navigation.locationMethod === 'selection'
    ? '区間の開始地点'
    : ['audio', 'manual'].includes(navigation.locationMethod)
      ? '推定現在地'
      : '最後に確認した地点';
  const shortCurrent = navigation.locationMethod === 'selection' ? '開始' : '現在地';
  const current = navigation.currentNode?.floor === floor
    ? `<g class="current-location" transform="translate(${navigation.currentNode.x} ${navigation.currentNode.y})" aria-label="${currentLabel}"><circle class="current-halo" r="13"/><circle class="current-dot" r="6"/><rect x="-26" y="-32" width="52" height="18" rx="9"/><text x="0" y="-20" text-anchor="middle">${shortCurrent}</text></g>`
    : '';
  const destination = navigation.destinationNode?.floor === floor
    ? `<g class="route-destination" transform="translate(${navigation.destinationNode.x} ${navigation.destinationNode.y})" aria-label="次の作品"></g>`
    : '';
  const transitions = (navigation.transitions ?? []).flatMap(transition => {
    if (transition.from.floor !== floor && transition.to.floor !== floor) return [];
    const leaving = transition.from.floor === floor;
    const node = leaving ? transition.from : transition.to;
    const direction = transition.to.floor > transition.from.floor ? '↑' : '↓';
    const fullLabel = leaving ? transition.message : `${transition.facilityName}から到着・経路続行`;
    const shortTarget = floorName(transition.to.floor);
    const kindPrefix = transition.kind === 'elevator' ? 'EV ' : '';
    const pill = leaving
      ? `<rect x="16" y="-11" width="76" height="22" rx="11"/><text class="transition-label" x="54" y="3.5" text-anchor="middle">${escapeHtml(`${direction}${kindPrefix}${shortTarget}へ`)}</text>`
      : '';
    return [`<g class="floor-transition ${leaving ? 'is-leaving' : 'is-arriving'}" transform="translate(${node.x} ${node.y})" aria-label="${escapeHtml(fullLabel)}"><circle r="12"/><text class="transition-arrow" x="0" y="4.5" text-anchor="middle">${direction}</text>${pill}</g>`];
  }).join('');
  const passedTransitions = (navigation.passedTransitions ?? [])
    .flatMap(transition => [transition.from, transition.to]
      .filter(node => node.floor === floor)
      .map(node => `<g class="passed-floor-transition" transform="translate(${node.x} ${node.y})"><circle r="9"/><path d="M-3 0h6"/></g>`))
    .join('');
  return `<g class="route-lines">${passed}${activeCasing}${active}</g>${passedTransitions}${transitions}${current}${destination}`;
}

function wrapHudText(text, maxChars = 14) {
  const str = String(text ?? '').trim();
  if (!str) return [];
  if (str.length <= maxChars) return [str];
  const lines = [];
  let rest = str;
  while (rest.length > maxChars) {
    let split = -1;
    for (let i = maxChars; i >= Math.floor(maxChars * 0.5); i -= 1) {
      if ('・（ '.includes(rest[i])) {
        split = rest[i] === '（' ? i : i + 1;
        break;
      }
    }
    if (split <= 0) split = maxChars;
    lines.push(rest.slice(0, split).trim());
    rest = rest.slice(split).trim();
  }
  if (rest) lines.push(rest);
  return lines;
}

function mapHudMarkup({floorLabel, continuationFloors, hasConstruction = false, hasRestArea = false, hasExhibition = false, facilityTypes = []}) {
  const x = 12;
  const y = 12;
  const width = 188;
  const padX = x + 11;
  const contText = continuationFloors.length ? `続き：${continuationFloors.map(floorName).join('・')}` : '';
  const contLines = contText ? wrapHudText(contText, 14) : [];

  let cursorY = y + 36;
  const parts = [];
  parts.push(`<text class="hud-floor" x="${padX}" y="${cursorY}">${escapeHtml(floorLabel)}</text>`);
  cursorY += 16;

  if (contLines.length) {
    for (const line of contLines) {
      parts.push(`<text class="hud-continuation" x="${padX}" y="${cursorY}">${escapeHtml(line)}</text>`);
      cursorY += 14;
    }
  }

  cursorY += 2;
  parts.push(`<line class="hud-divider" x1="${padX}" y1="${cursorY}" x2="${x + width - 11}" y2="${cursorY}"/>`);
  cursorY += 16;

  const col1 = padX;
  const col2 = x + 98;
  const extraItems = [];
  if (hasConstruction) extraItems.push({cls: 'hud-swatch-construction', label: '工事中'});
  if (hasRestArea) extraItems.push({cls: 'hud-swatch-rest', label: '休憩'});
  if (hasExhibition) extraItems.push({cls: 'hud-swatch-exhibition', label: '企画展'});
  const extraRight = extraItems[0]
    ? `<rect class="${extraItems[0].cls}" x="${col2}" y="${cursorY + 29}" width="16" height="10" rx="2.5"/><text class="hud-legend-text" x="${col2 + 22}" y="${cursorY + 38}">${extraItems[0].label}</text>`
    : '';
  const extraRow = extraItems[1]
    ? `<rect class="${extraItems[1].cls}" x="${col1}" y="${cursorY + 48}" width="16" height="10" rx="2.5"/><text class="hud-legend-text" x="${col1 + 22}" y="${cursorY + 57}">${extraItems[1].label}</text>`
    : '';
  let bottomY = cursorY + (extraItems.length > 1 ? 57 : 38);

  const facLegendSpecs = [
    {type: 'elevator', label: 'エレベーター'},
    {type: 'escalator', label: 'エスカレーター'},
    {type: 'stairs-up', label: '上り階段'},
    {type: 'stairs-down', label: '下り階段'},
    {type: 'stairs-both', label: '上下階段'},
    {type: 'stairs', label: '同階階段'},
    {type: 'wc', label: 'トイレ'},
    {type: 'information', label: '案内所'},
    {type: 'ticket', label: 'チケット'},
    {type: 'shop', label: 'ショップ'},
    {type: 'metro', label: 'メトロ'},
    {type: 'parking', label: 'パーキング'},
    {type: 'cafe', label: 'カフェ'}
  ].filter(spec => facilityTypes.includes(spec.type));

  let facRow = '';
  if (facLegendSpecs.length) {
    const divY = bottomY + 8;
    const cols = [col1, col2];
    const itemsSvg = facLegendSpecs.map((spec, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const fx = cols[c];
      const ry = divY + 16 + r * 18;
      return `<g class="facility-badge hud-fac-badge facility-${escapeHtml(spec.type)}" transform="translate(${fx + 5.5} ${ry - 3.5}) scale(0.76)">${facilityBadgeGraphic(spec.type)}</g><text class="hud-legend-text hud-fac-label" x="${fx + 13.5}" y="${ry}">${spec.label}</text>`;
    }).join('');
    const numRows = Math.ceil(facLegendSpecs.length / 2);
    facRow = `<line class="hud-divider" x1="${padX}" y1="${divY}" x2="${x + width - 11}" y2="${divY}"/>${itemsSvg}`;
    bottomY = divY + 16 + (numRows - 1) * 18;
  }

  parts.push(`
    <g class="hud-legend" aria-label="地図の凡例">
      <circle class="hud-dot hud-dot-dest" cx="${col1 + 5}" cy="${cursorY - 3.5}" r="4.8"/>
      <text class="hud-legend-text" x="${col1 + 15}" y="${cursorY}">目的地</text>
      <line class="hud-line-active" x1="${col2}" y1="${cursorY - 3.5}" x2="${col2 + 16}" y2="${cursorY - 3.5}"/>
      <text class="hud-legend-text" x="${col2 + 22}" y="${cursorY}">次まで</text>

      <circle class="hud-dot hud-dot-route" cx="${col1 + 5}" cy="${cursorY + 15.5}" r="4.8"/>
      <text class="hud-legend-text" x="${col1 + 15}" y="${cursorY + 19}">予定</text>
      <line class="hud-line-passed" x1="${col2}" y1="${cursorY + 15.5}" x2="${col2 + 16}" y2="${cursorY + 15.5}"/>
      <text class="hud-legend-text" x="${col2 + 22}" y="${cursorY + 19}">通過済</text>

      <circle class="hud-dot hud-dot-viewed" cx="${col1 + 5}" cy="${cursorY + 34.5}" r="4.8"/>
      <text class="hud-legend-text" x="${col1 + 15}" y="${cursorY + 38}">済</text>
      ${extraRight}
      ${extraRow}
      ${facRow}
    </g>
  `);
  const height = (bottomY + 12) - y;
  return {
    rect: {x, y, width, height},
    markup: `<g class="map-hud" data-hud-bounds="${x},${y},${width},${height}"><rect class="hud-card" x="${x}" y="${y}" width="${width}" height="${height}" rx="12"/><g clip-path="url(#map-hud-clip)">${parts.join('')}</g></g>`
  };
}

export function floorMapMarkup({
  floor,
  floorLabel,
  works,
  selectedId,
  navigation,
  roomNotices = [],
  routeWorkIds = null,
  viewedIds = null,
  facilityFilter = 'none'
}) {
  const plan = floorGeoData.floors[String(floor)];
  if (!plan) throw new Error(`Unknown floor plan: ${floor}`);
  const routeWorkSet = Array.isArray(routeWorkIds) ? new Set(routeWorkIds) : null;
  const viewedSet = viewedIds instanceof Set ? viewedIds : Array.isArray(viewedIds) ? new Set(viewedIds) : null;
  const worksByRoom = new Map();
  works.filter(work => work.floor === floor && work.locationPrecision === 'room').forEach(work => {
    const key = String(work.room);
    if (!worksByRoom.has(key)) worksByRoom.set(key, []);
    worksByRoom.get(key).push(work);
  });

  let footprint = '';
  let rooms = '';
  if (plan.isCustomFloorPlan && plan.customPlan) {
    const cp = plan.customPlan;
    const cc = cp.courCarree;
    const ccCx = Math.round((cc.x + cc.width / 2) * 10) / 10;
    const ccCy = Math.round((cc.y + cc.height / 2) * 10) / 10;
    const pyr = cp.pyramid;
    const ps = pyr.size;
    const courCarreeDetail = `
      <g class="custom-cour-carree" aria-hidden="true">
        <rect class="cour-carree-frame" x="${cc.x}" y="${cc.y}" width="${cc.width}" height="${cc.height}"/>
        <line class="cour-axis" x1="${cc.x + 8}" y1="${ccCy}" x2="${cc.x + cc.width - 8}" y2="${ccCy}"/>
        <line class="cour-axis" x1="${ccCx}" y1="${cc.y + 8}" x2="${ccCx}" y2="${cc.y + cc.height - 8}"/>
        <circle class="cour-fountain" cx="${ccCx}" cy="${ccCy}" r="7.5"/>
        <circle class="cour-fountain-inner" cx="${ccCx}" cy="${ccCy}" r="2.6"/>
      </g>`;
    const pyramidDetail = `
      <g class="custom-pyramid-emblem" transform="translate(${pyr.cx} ${pyr.cy})" aria-hidden="true">
        <rect class="pyramid-base" x="${-ps}" y="${-ps}" width="${ps * 2}" height="${ps * 2}" rx="1.5"/>
        <line class="pyramid-rib" x1="${-ps}" y1="${-ps}" x2="${ps}" y2="${ps}"/>
        <line class="pyramid-rib" x1="${ps}" y1="${-ps}" x2="${-ps}" y2="${ps}"/>
        <polygon class="pyramid-facet" points="0,${-ps} ${ps},0 0,${ps} ${-ps},0"/>
        <circle class="pyramid-apex" cx="0" cy="0" r="2.2"/>
      </g>`;
    const underground = cp.undergroundOutline
      ? `<path class="custom-underground-base" d="${cp.undergroundOutline}"/>`
      : '';
    const courtyards = cp.courtyards
      .map(c => `<polygon class="custom-courtyard" points="${c.points}"/>`)
      .join('');
    const serviceHalls = cp.fusedServiceHalls
      ? `<g class="custom-service-shells" aria-hidden="true">${cp.serviceHalls.map(h => `<polygon class="custom-service-shell" points="${h.points}"/>`).join('')}</g><g class="custom-service-fills">${cp.serviceHalls.map(h => `<polygon class="custom-service-fill" points="${h.points}"/>`).join('')}</g>`
      : cp.serviceHalls.map(h => `<polygon class="custom-service-hall" points="${h.points}"/>`).join('');
    const restAreas = (cp.restAreas || [])
      .map(r => `<g class="custom-rest-area" aria-label="${escapeHtml(`${r.label}（${r.sublabel}）`)}"><polygon class="rest-area-poly" points="${r.points}"/><text class="rest-area-label" x="${r.labelX}" y="${r.labelY - 3}" text-anchor="middle">${escapeHtml(r.label)}</text><text class="rest-area-sub" x="${r.labelX}" y="${r.labelY + 8}" text-anchor="middle">${escapeHtml(r.sublabel)}</text></g>`)
      .join('');
    // Unified outer architectural wall shell behind rooms + passages so wings read as one cohesive space
    const wingShell = [
      ...cp.passages.map(p => `<polygon class="custom-wing-shell ${p.underConstruction ? 'is-construction ' : ''}wing-${escapeHtml(p.wing)}" points="${p.points}"/>`),
      ...plan.rooms.map(r => {
        const cls = `custom-wing-shell ${r.underConstruction ? 'is-construction ' : ''}${r.isExhibition ? 'is-exhibition ' : ''}wing-${escapeHtml(r.wing)}`;
        return r.path
          ? `<path class="${cls}" d="${r.path}" fill-rule="evenodd"/>`
          : `<polygon class="${cls}" points="${r.points}"/>`;
      })
    ].join('');
    const passages = cp.passages
      .map(p => `<polygon class="custom-passage ${p.underConstruction ? 'is-construction ' : ''}wing-${escapeHtml(p.wing)}" points="${p.points}"/>`)
      .join('');
    const dividers = (cp.dividers || [])
      .map(d => `<line class="custom-room-divider" x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}"/>`)
      .join('');
    const constructionNotices = (cp.constructionNotices || [])
      .map(n => `<g class="construction-badge" transform="translate(${n.x} ${n.y})" aria-label="${escapeHtml(n.text)}"><rect x="-38" y="-9.5" width="76" height="19" rx="9.5"/><text x="0" y="3.5" text-anchor="middle">${escapeHtml(n.text)}</text></g>`)
      .join('');
    const exhibitionLabels = (cp.exhibitionLabels || [])
      .map(e => `<g class="exhibition-label-group" aria-label="${escapeHtml(e.label)}"><text class="exhibition-label" x="${e.x}" y="${e.y - 2}" text-anchor="middle">${escapeHtml(e.label)}</text>${e.sublabel ? `<text class="exhibition-sub" x="${e.x}" y="${e.y + 9}" text-anchor="middle">${escapeHtml(e.sublabel)}</text>` : ''}</g>`)
      .join('');
    const hallLabels = (cp.hallLabels || [])
      .map(h => `<text class="hall-landmark-label" x="${h.x}" y="${h.y + 3}" text-anchor="middle">${escapeHtml(h.text)}</text>`)
      .join('');
    footprint = `
      <path class="palace-footprint custom-palace-base" d="${cp.footprintPath}" fill-rule="evenodd"/>
      ${underground}
      ${courCarreeDetail}
      ${pyramidDetail}
      ${courtyards}
      ${serviceHalls}
      ${restAreas}`;
    rooms = `<g class="custom-wing-shells" aria-hidden="true">${wingShell}</g>${passages}${plan.rooms.map(item => roomMarkup(item, worksByRoom, selectedId, routeWorkSet)).join('')}<g class="custom-room-dividers" aria-hidden="true">${dividers}</g>${constructionNotices}${exhibitionLabels}${hallLabels}`;
  } else {
    footprint = floorGeoData.footprintPolys.map(points => `<polygon class="palace-footprint" points="${points}"/>`).join('');
    rooms = plan.rooms.map(item => roomMarkup(item, worksByRoom, selectedId, routeWorkSet)).join('');
  }
  const corridors = plan.corridors.map(item => `<polygon class="geo-corridor" points="${item.points}"/>`).join('');
  const walls = plan.walls.map(points => `<polyline class="geo-wall" points="${points}"/>`).join('');
  const doors = plan.doors.map(([x, y]) => `<circle class="geo-door" cx="${x}" cy="${y}" r="1.8"/>`).join('');
  const sortedFacilities = [...plan.facilities].sort((a, b) => {
    const aPick = (facilityFilter === 'wc' && a.type === 'wc') || (facilityFilter === 'cafe' && a.type === 'cafe') ? 1 : 0;
    const bPick = (facilityFilter === 'wc' && b.type === 'wc') || (facilityFilter === 'cafe' && b.type === 'cafe') ? 1 : 0;
    return aPick - bPick;
  });
  const facilities = sortedFacilities.map(item => facilityIconMarkup(item, facilityFilter)).join('');

  // Place ONLY the wing names that actually exist on this floor, strictly outside the palace geometry
  const outerWings = plan.isCustomFloorPlan && plan.customPlan?.wingHeaders
    ? plan.customPlan.wingHeaders
    : floor === -2
      ? []
      : floor === 2
        ? [
            {label: 'リシュリュー翼', x: 370, y: 34},
            {label: 'シュリー翼', x: 740, y: 34}
          ]
        : [
            {label: 'リシュリュー翼', x: 370, y: 34},
            {label: 'シュリー翼', x: 740, y: 34},
            {label: 'ドゥノン翼', x: 320, y: 576}
          ];
  const wingLabels = outerWings.map(w => `<text class="wing-label" x="${w.x}" y="${w.y}" text-anchor="${plan.isCustomFloorPlan ? 'middle' : 'start'}">${escapeHtml(w.label)}</text>`).join('');

  // Room numbers FIRST (room numbers have highest priority; artwork pins automatically avoid them!)
  let roomLabels = '';
  const roomLabelBoxes = [];
  if (plan.uniformRoomLabels) {
    roomLabels = (plan.roomLabels || [])
      .map(lbl => {
        const yPos = Math.round((lbl.y + 3.2) * 10) / 10;
        roomLabelBoxes.push({x0: lbl.x - 11.5, y0: yPos - 8.5, x1: lbl.x + 11.5, y1: yPos + 2});
        return `<text class="room-number is-uniform-room" data-room-label="${escapeHtml(lbl.number)}" x="${lbl.x}" y="${yPos}">${escapeHtml(lbl.number)}</text>`;
      })
      .join('');
  } else {
    const placedRoomLabels = [];
    const candidateRooms = (plan.roomLabels || []).map(lbl => {
      const roomWorks = worksByRoom.get(lbl.number) || [];
      const isSelectedRoom = roomWorks.some(w => w.id === selectedId);
      const isRouteRoom = routeWorkSet ? roomWorks.some(w => routeWorkSet.has(w.id)) : false;
      const priority = isSelectedRoom ? 4 : isRouteRoom ? 3 : lbl.priority ? 2 : 1;
      return {roomNum: lbl.number, x: lbl.x, y: Math.round((lbl.y + 3) * 10) / 10, priority, emphasize: isSelectedRoom || isRouteRoom || lbl.priority};
    });
    candidateRooms.sort((a, b) => b.priority - a.priority);
    roomLabels = candidateRooms
      .filter(item => {
        const minDist = item.priority >= 3 ? 20 : 24;
        if (placedRoomLabels.some(([px, py]) => Math.hypot(px - item.x, py - item.y) < minDist)) return false;
        placedRoomLabels.push([item.x, item.y]);
        roomLabelBoxes.push({x0: item.x - 11, y0: item.y - 8, x1: item.x + 11, y1: item.y + 2});
        return true;
      })
      .map(item => `<text class="room-number ${item.emphasize ? 'is-anchor-room' : ''}" data-room-label="${escapeHtml(item.roomNum)}" x="${item.x}" y="${item.y}">${escapeHtml(item.roomNum)}</text>`)
      .join('');
  }

  const artworks = artworkMarkup(plan.roomAnchors || {}, worksByRoom, selectedId, routeWorkIds, viewedSet, roomLabelBoxes);

  const alerts = roomNotices.filter(notice => notice.floor === floor).map(notice => {
    const anchor = plan.roomAnchors?.[String(notice.room)];
    if (!anchor) return '';
    return `<g class="room-alert" transform="translate(${anchor.x + 12} ${anchor.y - 26})" aria-label="${escapeHtml(notice.label)}"><path d="M0 14L8 0l8 14Z"/><text x="8" y="11" text-anchor="middle">!</text></g>`;
  }).join('');

  const routeLayer = routeLayerMarkup(floor, navigation);
  const continuationFloors = (navigation?.routeFloors ?? []).filter(routeFloor => routeFloor !== floor);
  const facilityTypes = [...new Set(plan.facilities.map(f => f.type))];
  const hud = mapHudMarkup({
    floorLabel,
    continuationFloors,
    hasConstruction: Boolean(plan.hasConstruction),
    hasRestArea: Boolean(plan.hasRestArea),
    hasExhibition: Boolean(plan.hasExhibition),
    facilityTypes
  });
  const isFacilityPickMode = facilityFilter === 'wc' || facilityFilter === 'cafe';

  const svgDefs = `
    <filter id="pin-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.8" stdDeviation="1.4" flood-color="#122126" flood-opacity="0.32"/></filter>
    <clipPath id="map-hud-clip"><rect x="${hud.rect.x}" y="${hud.rect.y}" width="${hud.rect.width}" height="${hud.rect.height}" rx="12"/></clipPath>
    <linearGradient id="palace-stone-grad" gradientUnits="userSpaceOnUse" x1="0" y1="108" x2="0" y2="490"><stop offset="0%" stop-color="#f1ece3"/><stop offset="100%" stop-color="#e8e1d5"/></linearGradient>
    <linearGradient id="wing-richelieu-grad" gradientUnits="userSpaceOnUse" x1="0" y1="115" x2="0" y2="250"><stop offset="0%" stop-color="#c3a390"/><stop offset="100%" stop-color="#b4927e"/></linearGradient>
    <linearGradient id="wing-sully-grad" gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="0" y2="380"><stop offset="0%" stop-color="#88b0bc"/><stop offset="100%" stop-color="#769ea9"/></linearGradient>
    <linearGradient id="wing-denon-grad" gradientUnits="userSpaceOnUse" x1="0" y1="350" x2="0" y2="490"><stop offset="0%" stop-color="#cfa18e"/><stop offset="100%" stop-color="#be8d7a"/></linearGradient>
    <linearGradient id="studio-rest-grad" gradientUnits="userSpaceOnUse" x1="0" y1="145" x2="0" y2="230"><stop offset="0%" stop-color="#80b896"/><stop offset="100%" stop-color="#68a17e"/></linearGradient>
    <linearGradient id="exhibition-hall-grad" gradientUnits="userSpaceOnUse" x1="0" y1="265" x2="0" y2="340"><stop offset="0%" stop-color="#6fbbe0"/><stop offset="100%" stop-color="#52a1c9"/></linearGradient>
    <linearGradient id="stairs-both-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="50%" stop-color="#1565d8"/><stop offset="50%" stop-color="#0e9457"/></linearGradient>
    <pattern id="construction-stripe" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="7" height="7" fill="#f2cf5b"/>
      <line x1="0" y1="0" x2="0" y2="7" stroke="#dfb22a" stroke-width="2.6"/>
    </pattern>`;

  return `<svg id="floor-map" class="${isFacilityPickMode ? 'facility-pick-mode' : ''} ${plan.isCustomFloorPlan ? 'is-custom-floor-plan' : ''}" viewBox="0 0 960 600" data-map-floor="${escapeHtml(String(floor))}" role="img" aria-labelledby="map-title map-description"><title id="map-title">${escapeHtml(floorLabel)}の2Dフロアマップ</title><desc id="map-description">ルーブル宮殿の展示室、廊下、壁、階段、エレベーター、トイレ、カフェ、作品位置および経路を階別に表示。</desc><defs>${svgDefs}</defs><rect class="map-background" width="960" height="600"/><g class="map-layer layer-wings" data-layer="wings">${footprint}</g><g class="map-layer layer-rooms" data-layer="rooms">${rooms}</g><g class="map-layer layer-corridors" data-layer="corridors">${corridors}</g><g class="map-layer layer-connections" data-layer="connections">${walls}</g><g class="map-layer layer-doors" data-layer="doors">${doors}</g><g class="map-layer layer-alerts" data-layer="alerts">${alerts}</g><g class="map-layer layer-route" data-layer="route" aria-label="入口から最終作品までのルート">${routeLayer}</g><g class="map-layer layer-facilities" data-layer="facilities">${facilities}</g><g class="map-layer layer-artworks ${isFacilityPickMode ? 'is-subdued' : ''}" data-layer="artworks">${artworks}</g><g class="map-layer layer-labels" data-layer="labels">${wingLabels}${roomLabels}</g>${hud.markup}</svg>`;
}

function clampView(view) {
  view.width = Math.min(BASE_VIEW.width, Math.max(MIN_VIEW_WIDTH, view.width));
  view.height = view.width * BASE_VIEW.height / BASE_VIEW.width;
  view.x = Math.min(BASE_VIEW.width - view.width, Math.max(0, view.x));
  view.y = Math.min(BASE_VIEW.height - view.height, Math.max(0, view.y));
}

export function wireFloorMap({onWorkSelect}) {
  const svg = document.querySelector('#floor-map');
  const frame = svg?.closest('.map-frame');
  if (!svg || !frame) return;
  const floorKey = svg.dataset.mapFloor ?? '';
  // Restore this floor's zoom/pan so a re-render (e.g. after opening a work) does not jump back to 100%.
  const view = {...(savedViews.get(floorKey) || BASE_VIEW)};
  const pointers = new Map();
  let lastDrag = null;
  let lastPinch = null;
  let pointerStart = null;
  let didDrag = false;
  const status = frame.querySelector('[data-map-status]');
  const applyView = () => {
    clampView(view);
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    if (status) status.textContent = `${Math.round(BASE_VIEW.width / view.width * 100)}%`;
    savedViews.set(floorKey, {...view});
  };
  const zoomAt = (factor, clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    const pointX = view.x + (clientX - rect.left) / rect.width * view.width;
    const pointY = view.y + (clientY - rect.top) / rect.height * view.height;
    const nextWidth = Math.min(BASE_VIEW.width, Math.max(MIN_VIEW_WIDTH, view.width * factor));
    const nextHeight = nextWidth * BASE_VIEW.height / BASE_VIEW.width;
    const ratio = nextWidth / view.width;
    view.x = pointX - (pointX - view.x) * ratio;
    view.y = pointY - (pointY - view.y) * ratio;
    view.width = nextWidth;
    view.height = nextHeight;
    applyView();
  };
  const reset = () => { Object.assign(view, BASE_VIEW); applyView(); };

  frame.querySelectorAll('[data-map-action]').forEach(button => button.addEventListener('click', () => {
    const rect = svg.getBoundingClientRect();
    if (button.dataset.mapAction === 'reset') reset();
    else zoomAt(button.dataset.mapAction === 'in' ? 0.76 : 1.3, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }));
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 0.88 : 1.14, event.clientX, event.clientY);
  }, {passive:false});
  svg.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-map-work]')) {
      pointerStart = {x:event.clientX, y:event.clientY};
      didDrag = false;
      return;
    }
    svg.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    lastDrag = {x:event.clientX, y:event.clientY};
    pointerStart = {x:event.clientX, y:event.clientY};
    didDrag = false;
    svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
      didDrag = true;
    }
    pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    const active = [...pointers.values()];
    if (active.length === 2) {
      didDrag = true;
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
      const midpoint = {x:(active[0].x + active[1].x) / 2, y:(active[0].y + active[1].y) / 2};
      if (lastPinch) zoomAt(lastPinch.distance / distance, midpoint.x, midpoint.y);
      lastPinch = {distance, midpoint};
      lastDrag = midpoint;
      return;
    }
    lastPinch = null;
    if (!lastDrag) return;
    const rect = svg.getBoundingClientRect();
    view.x -= (event.clientX - lastDrag.x) / rect.width * view.width;
    view.y -= (event.clientY - lastDrag.y) / rect.height * view.height;
    lastDrag = {x:event.clientX, y:event.clientY};
    applyView();
  });
  const endPointer = event => {
    pointers.delete(event.pointerId);
    lastPinch = null;
    lastDrag = pointers.size ? [...pointers.values()][0] : null;
    if (!pointers.size) svg.classList.remove('is-dragging');
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  // Tapping a "N件" group fans its pins out around it; tapping it again, an empty spot of the map, or Esc
  // closes the fan. The fan stays in place while zooming or panning (it is drawn in map coordinates).
  let openCluster = null;
  const closeSpider = () => {
    svg.querySelector('[data-spider-pins]')?.remove();
    if (openCluster) {
      openCluster.classList.remove('is-open');
      openCluster.setAttribute('aria-expanded', 'false');
    }
    openCluster = null;
  };
  const openSpider = marker => {
    closeSpider();
    const markup = clusterSpiderMarkup(Number(marker.dataset.cluster));
    if (!markup) return;
    const hud = svg.querySelector('.map-hud');
    if (hud) hud.insertAdjacentHTML('beforebegin', markup);
    else svg.insertAdjacentHTML('beforeend', markup);
    openCluster = marker;
    marker.classList.add('is-open');
    marker.setAttribute('aria-expanded', 'true');
    wireMarkers(svg.querySelector('[data-spider-pins]'));
  };
  const wireMarkers = (root = svg) => {
    root.querySelectorAll('[data-map-work]').forEach(marker => {
      const choose = event => {
        if (didDrag) { didDrag = false; return; }
        event?.stopPropagation?.();
        if (marker.dataset.cluster != null) {
          if (openCluster === marker) closeSpider();
          else openSpider(marker);
          return;
        }
        const roomWorks = (marker.dataset.roomWorks || '').split(',').filter(Boolean);
        onWorkSelect(marker.dataset.mapWork, roomWorks);
      };
      marker.addEventListener('click', choose);
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(event); }
      });
    });
  };
  svg.addEventListener('click', event => {
    if (didDrag || !openCluster || event.target.closest('[data-map-work]')) return;
    closeSpider();
  });
  svg.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openCluster) { const marker = openCluster; closeSpider(); marker.focus(); }
  });
  wireMarkers();
  applyView();
}
