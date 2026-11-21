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

export function formatWing(wing) {
  if (!wing) return '';
  return `${WING_NAMES[wing] ?? wing}翼`;
}

export function formatWorkLocation(work) {
  if (!work) return '';
  if (work.locationPrecision === 'room' && work.room != null && work.floor != null) {
    return `${FLOOR_NAMES[work.floor] ?? `${work.floor}階`} · ${formatWing(work.wing)} · ${work.room}室`;
  }
  if (work.locationLabel) {
    return work.locationLabel;
  }
  return '展示室：確認中';
}

export function formatWorkCreatorMeta(work) {
  if (!work) return '';
  const author = work.author || '制作者：要確認';
  return work.year ? `${author} · ${work.year}` : author;
}
