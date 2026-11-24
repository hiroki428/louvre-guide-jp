import {formatWingLocalized, getFloorName, getLang, localizeLocationLabel, t} from './i18n.js';

export const APP_NAME = 'Louvre Audio Map';
export const APP_SHORT_NAME = 'Louvre Map';
export const APP_TAGLINE = '美術との出会いを、あなたのペースで。';

export const FLOORS = [2, 1, 0, -1, -2];
export const FLOOR_NAMES = Object.freeze({
  2: '2階',
  1: '1階',
  0: '0階',
  '-1': '−1階',
  '-2': '−2階'
});
export const WING_NAMES = Object.freeze({
  Richelieu: 'リシュリュー',
  Sully: 'シュリー',
  Denon: 'ドゥノン'
});
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_DURATIONS = [60, 120];

export function formatWing(wing, lang = getLang()) {
  return formatWingLocalized(wing, lang);
}

export function formatWorkLocation(work, lang = getLang()) {
  if (!work) return '';
  if (work.locationPrecision === 'room' && work.room != null && work.floor != null) {
    return t('location.full', {
      floor: getFloorName(work.floor, lang),
      wing: formatWingLocalized(work.wing, lang),
      room: work.room
    }, lang);
  }
  if (work.locationLabel) {
    return localizeLocationLabel(work.locationLabel, lang);
  }
  return t('location.checking', null, lang);
}

export function formatWorkCreatorMeta(work, lang = getLang()) {
  if (!work) return '';
  const author = work.author || t('creator.unknown', null, lang);
  return work.year ? `${author} · ${work.year}` : author;
}
