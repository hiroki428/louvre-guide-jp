import {floorGeoData} from './floor-map-geo.js';

const BASE_VIEW = Object.freeze({...floorGeoData.meta.viewBox});
const MIN_VIEW_WIDTH = 280;
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
  return `<g class="room-node ${selected ? 'is-selected ' : ''}${onRoute ? 'has-route-work ' : ''}wing-${escapeHtml(room.wing)}"${roomAttr}><polygon points="${room.points}"/></g>`;
}

function artworkMarkup(anchors, worksByRoom, selectedId, routeWorkIds, viewedSet) {
  const routeOrder = new Map();
  if (Array.isArray(routeWorkIds)) {
    routeWorkIds.forEach((id, idx) => routeOrder.set(id, idx + 1));
  }
  const routeSet = routeOrder.size ? new Set(routeWorkIds) : null;
  const parts = [];
  const sortedEntries = [...worksByRoom.entries()].sort(([, a], [, b]) => {
    const aDest = a.some(w => w.id === selectedId) ? 2 : (routeSet && a.some(w => routeSet.has(w.id)) ? 1 : 0);
    const bDest = b.some(w => w.id === selectedId) ? 2 : (routeSet && b.some(w => routeSet.has(w.id)) ? 1 : 0);
    return aDest - bDest;
  });

  for (const [roomNum, roomWorks] of sortedEntries) {
    const anchor = anchors[roomNum];
    if (!anchor || !roomWorks.length) continue;
    const primary = pickPrimaryWork(roomWorks, selectedId, routeWorkIds);
    const destination = primary.id === selectedId;
    const onRoute = !routeSet || roomWorks.some(work => routeSet.has(work.id));
    const routeWorksInRoom = routeSet ? roomWorks.filter(w => routeSet.has(w.id)) : roomWorks;
    const allViewed = viewedSet && routeWorksInRoom.length > 0 && routeWorksInRoom.every(w => viewedSet.has(w.id));
    const orderNum = routeOrder.get(primary.id) || (routeWorksInRoom[0] ? routeOrder.get(routeWorksInRoom[0].id) : null);
    const x = anchor.x;
    const y = anchor.y;
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
        <circle class="artwork-pin pin-catalog" cx="0" cy="0" r="6"/>
        <circle class="artwork-pin-core" cx="0" cy="0" r="2.1"/>
      `;
      badgeX = 6.5;
      badgeY = -6.5;
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

    parts.push(`<g class="${stateClasses}" transform="translate(${x} ${y})" data-map-work="${escapeHtml(primary.id)}" data-room-works="${escapeHtml(idsAttr)}" tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">${shapeMarkup}${countBadge}</g>`);
  }
  return parts.join('');
}

function facilityIconMarkup(item, facilityFilter) {
  const isPicked = (facilityFilter === 'wc' && item.type === 'wc') || (facilityFilter === 'cafe' && item.type === 'cafe');
  const isDimmed = facilityFilter && facilityFilter !== 'none' && !isPicked;
  const scale = isPicked ? 1.15 : 0.7;
  const common = `transform="translate(${item.x} ${item.y}) scale(${scale})"`;
  const icons = {
    stairs:`<path d="M-8 7h4V3h4v-4h4v-4h4"/>`,
    elevator:`<rect x="-7" y="-8" width="14" height="16" rx="1"/><path d="M0-5v10M-3-2l3-3 3 3M-3 2l3 3 3-3"/>`,
    escalator:`<path d="M-8 6h4l8-12h4M-7-6h4l8 12h3"/>`,
    wc:`<path d="M-5-7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 15V-1h6v9M5-7a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM2 8l1-9h4l1 9"/>`,
    cafe:`<path d="M-7-3h10v6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4v-6Zm10 1h2a2 2 0 0 1 0 4h-2M-8 9h14"/>`,
    information:`<circle r="8"/><path d="M0-3v7M0-6h.01"/>`,
    ticket:`<path d="M-8-5h16v10H-8zM-3-5v10"/>`,
    cloak:`<path d="M-7 7V-5h14V7M-3-5v-3h6v3"/>`,
    friends:`<path d="M-5-6a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM-10 8c0-5 10-5 10 0M5-4a2.5 2.5 0 1 0 0 5M1 8c0-4 8-4 8 0"/>`,
    auditorium:`<path d="M-8 7h16M-6 4h12M-4 1h8M-2-2h4"/>`,
    shop:`<path d="M-8-3h16l-2-5H-6zM-6-3V8H6V-3M-2 8V2h4v6"/>`
  };
  const badgeBg = isPicked ? `<circle class="facility-pick-bg pick-${escapeHtml(item.type)}" r="12"/>` : '';
  const ariaLabel = item.type === 'wc' ? 'トイレ' : item.type === 'cafe' ? (item.label || 'カフェ') : (item.label || item.type);
  return `<g class="facility facility-${escapeHtml(item.type)} ${isPicked ? 'is-picked' : ''} ${isDimmed ? 'is-dimmed' : ''}" ${common} aria-label="${escapeHtml(ariaLabel)}">${badgeBg}${icons[item.type] || '<circle r="5"/>'}</g>`;
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

function mapHudMarkup({floorLabel, continuationFloors}) {
  const x = 12;
  const y = 12;
  const width = 180;
  const padX = x + 12;
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
  parts.push(`<line class="hud-divider" x1="${padX}" y1="${cursorY}" x2="${x + width - 12}" y2="${cursorY}"/>`);
  cursorY += 16;

  const col1 = padX;
  const col2 = x + 98;
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
    </g>
  `);
  const height = (cursorY + 38 + 12) - y;
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

  const footprint = floorGeoData.footprintPolys.map(points => `<polygon class="palace-footprint" points="${points}"/>`).join('');
  const rooms = plan.rooms.map(item => roomMarkup(item, worksByRoom, selectedId, routeWorkSet)).join('');
  const corridors = plan.corridors.map(item => `<polygon class="geo-corridor" points="${item.points}"/>`).join('');
  const walls = plan.walls.map(points => `<polyline class="geo-wall" points="${points}"/>`).join('');
  const doors = plan.doors.map(([x, y]) => `<circle class="geo-door" cx="${x}" cy="${y}" r="1.8"/>`).join('');
  const sortedFacilities = [...plan.facilities].sort((a, b) => {
    const aPick = (facilityFilter === 'wc' && a.type === 'wc') || (facilityFilter === 'cafe' && a.type === 'cafe') ? 1 : 0;
    const bPick = (facilityFilter === 'wc' && b.type === 'wc') || (facilityFilter === 'cafe' && b.type === 'cafe') ? 1 : 0;
    return aPick - bPick;
  });
  const facilities = sortedFacilities.map(item => facilityIconMarkup(item, facilityFilter)).join('');
  const artworks = artworkMarkup(plan.roomAnchors || {}, worksByRoom, selectedId, routeWorkIds, viewedSet);

  // Place ONLY the wing names that actually exist on this floor, strictly outside the palace geometry
  const outerWings = floor === -2
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
  const wingLabels = outerWings.map(w => `<text class="wing-label" x="${w.x}" y="${w.y}">${escapeHtml(w.label)}</text>`).join('');

  // Show curated room numbers across the floor (prioritizing active/route rooms, with collision guard)
  const placedRoomLabels = [];
  const candidateRooms = (plan.roomLabels || []).map(lbl => {
    const roomWorks = worksByRoom.get(lbl.number) || [];
    const hasWorks = roomWorks.length > 0;
    const isSelectedRoom = roomWorks.some(w => w.id === selectedId);
    const isRouteRoom = routeWorkSet ? roomWorks.some(w => routeWorkSet.has(w.id)) : false;
    const priority = isSelectedRoom ? 4 : isRouteRoom ? 3 : lbl.priority ? 2 : 1;
    const yOff = hasWorks ? 14 : 3;
    return {roomNum: lbl.number, x: lbl.x, y: lbl.y + yOff, priority, emphasize: isSelectedRoom || isRouteRoom || lbl.priority};
  });
  candidateRooms.sort((a, b) => b.priority - a.priority);
  const roomLabels = candidateRooms
    .filter(item => {
      const minDist = item.priority >= 3 ? 20 : 24;
      if (placedRoomLabels.some(([px, py]) => Math.hypot(px - item.x, py - item.y) < minDist)) return false;
      placedRoomLabels.push([item.x, item.y]);
      return true;
    })
    .map(item => `<text class="room-number ${item.emphasize ? 'is-anchor-room' : ''}" x="${item.x}" y="${item.y}">${escapeHtml(item.roomNum)}</text>`)
    .join('');

  const alerts = roomNotices.filter(notice => notice.floor === floor).map(notice => {
    const anchor = plan.roomAnchors?.[String(notice.room)];
    if (!anchor) return '';
    return `<g class="room-alert" transform="translate(${anchor.x + 12} ${anchor.y - 26})" aria-label="${escapeHtml(notice.label)}"><path d="M0 14L8 0l8 14Z"/><text x="8" y="11" text-anchor="middle">!</text></g>`;
  }).join('');

  const routeLayer = routeLayerMarkup(floor, navigation);
  const continuationFloors = (navigation?.routeFloors ?? []).filter(routeFloor => routeFloor !== floor);
  const hud = mapHudMarkup({floorLabel, continuationFloors});
  const isFacilityPickMode = facilityFilter === 'wc' || facilityFilter === 'cafe';

  return `<svg id="floor-map" class="${isFacilityPickMode ? 'facility-pick-mode' : ''}" viewBox="0 0 960 600" role="img" aria-labelledby="map-title map-description"><title id="map-title">${escapeHtml(floorLabel)}の2Dフロアマップ</title><desc id="map-description">実建築の館内GeoJSONデータをもとに、ルーブル宮殿の展示室、廊下、壁、扉、階段、エレベーター、トイレ、カフェ、作品位置および経路を階別に表示。</desc><defs><filter id="pin-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.8" stdDeviation="1.4" flood-color="#122126" flood-opacity="0.32"/></filter><clipPath id="map-hud-clip"><rect x="${hud.rect.x}" y="${hud.rect.y}" width="${hud.rect.width}" height="${hud.rect.height}" rx="12"/></clipPath></defs><rect class="map-background" width="960" height="600"/><g class="map-layer layer-wings" data-layer="wings">${footprint}</g><g class="map-layer layer-rooms" data-layer="rooms">${rooms}</g><g class="map-layer layer-corridors" data-layer="corridors">${corridors}</g><g class="map-layer layer-connections" data-layer="connections">${walls}</g><g class="map-layer layer-doors" data-layer="doors">${doors}</g><g class="map-layer layer-labels" data-layer="labels">${wingLabels}${roomLabels}</g><g class="map-layer layer-alerts" data-layer="alerts">${alerts}</g><g class="map-layer layer-route" data-layer="route" aria-label="入口から最終作品までのルート">${routeLayer}</g><g class="map-layer layer-artworks ${isFacilityPickMode ? 'is-subdued' : ''}" data-layer="artworks">${artworks}</g><g class="map-layer layer-facilities" data-layer="facilities">${facilities}</g>${hud.markup}</svg>`;
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
  const view = {...BASE_VIEW};
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
  document.querySelectorAll('[data-map-work]').forEach(marker => {
    const choose = event => {
      if (didDrag) { didDrag = false; return; }
      event?.stopPropagation?.();
      const roomWorks = (marker.dataset.roomWorks || '').split(',').filter(Boolean);
      onWorkSelect(marker.dataset.mapWork, roomWorks);
    };
    marker.addEventListener('click', choose);
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(event); }
    });
  });
  applyView();
}
