import {shortestPath} from './navigation.js';
import {formatWingLocalized, getFloorNavName, getLang, getWingName, t} from './i18n.js';

const clone = value => JSON.parse(JSON.stringify(value));

export function normalizeRoomNumber(value) {
  return String(value ?? '')
    .trim()
    .replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replace(/^(?:room|salle|sala|rm\.?|第)\s*/i, '')
    .replace(/\s*(?:室|展厅|号厅|호실|실|호)\s*$/, '');
}

export function findRoomCandidates(index, works, value, lang = getLang()) {
  const room = normalizeRoomNumber(value);
  if (!room) return [];
  return [...index.nodes.values()]
    .filter(node => node.type === 'room' && String(node.room) === room)
    .map(node => {
      const work = works.find(item => String(item.room) === room && item.floor === node.floor);
      const rawWing = node.wing ?? work?.wing;
      const wing = rawWing ? getWingName(rawWing, lang) : t('wing.unknown', null, lang);
      const wingLabel = rawWing ? formatWingLocalized(rawWing, lang) : wing;
      const floorLabel = getFloorNavName(node.floor, lang);
      const label = lang === 'en'
        ? `${wingLabel} · ${floorLabel} · ${t('location.room', {room}, lang)}`
        : `${wingLabel} · ${floorLabel} · ${t('location.room', {room}, lang)}`;
      return {nodeId:node.id, room, floor:node.floor, floorLabel, wing, wingLabel, label};
    });
}

export function correctLocation(index, navigation, candidateNodeId, options = {}) {
  const lang = options?.lang ?? getLang();
  const candidate = index.nodes.get(candidateNodeId);
  if (!candidate || candidate.type !== 'room') return {updated:false, reason:'invalid-room', message:t('map.errCheckRoom', null, lang)};
  if (!navigation?.destinationNodeId || !index.nodes.has(navigation.destinationNodeId)) {
    return {updated:false, reason:'route-unavailable', message:t('map.errRouteFromHere', null, lang)};
  }
  const route = shortestPath(index, candidateNodeId, navigation.destinationNodeId, options);
  if (!route) return {updated:false, reason:'route-unavailable', message:t('map.errRouteFromHere', null, lang)};
  return {
    updated:true,
    route,
    previous:clone(navigation),
    navigation:{
      ...navigation,
      currentNodeId:candidateNodeId,
      passedNodeGroups:clone(navigation.passedNodeGroups ?? [navigation.passedNodeIds ?? []]).filter(group => group.length),
      routeComplete:false,
      lastConfirmedWorkId:null,
      lastConfirmedRoom:String(candidate.room),
      lastConfirmedMethod:'manual'
    }
  };
}
