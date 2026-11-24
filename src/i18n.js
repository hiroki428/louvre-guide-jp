import {ja} from './locales/ja.js';
import {en} from './locales/en.js';

export const DEFAULT_LANG = 'ja';

export const SUPPORTED_LANGS = Object.freeze([
  {code: 'ja', label: '日本語', shortLabel: '日本語'},
  {code: 'en', label: 'English', shortLabel: 'EN'}
]);

const DICTIONARIES = Object.freeze({ja, en});

// Optional work-level translation overlay maps registered per language (populated in future locale packs).
const workLocaleOverrides = new Map();

// Fixed labels embedded in generated floor-map-geo.js / works.json locationLabel
const MAP_TEXT_TRANSLATIONS = Object.freeze({
  en: Object.freeze({
    'リシュリュー翼': 'Richelieu Wing',
    'シュリー翼': 'Sully Wing',
    'ドゥノン翼': 'Denon Wing',
    '工事中（閉鎖）': 'Closed',
    '工事中': 'Closed',
    'ステュディオ': 'Studio',
    '休憩エリア': 'Rest Area',
    '企画展': 'Exhibition',
    '特別展示': 'Special',
    '出口': 'Exit',
    'ナポレオンホール': 'Hall Napoléon',
    'ピラミッド中央入口': 'Pyramid Entrance',
    'ナポレオン・ホール中央': 'Hall Napoléon Center'
  })
});

const LOCATION_LABEL_TRANSLATIONS = Object.freeze({
  en: Object.freeze({
    '現在 非展示（公式収蔵DB）': 'Currently not on view (Louvre DB)',
    '現在 貸出中（ルーブル・アブダビ）': 'On loan (Louvre Abu Dhabi)',
    '現在 貸出中（アルル古代博物館）': 'On loan (Musée départemental Arles antique)',
    '現在 貸出中（フォンテーヌブロー宮殿）': 'On loan (Château de Fontainebleau)',
    '現在 貸出中（ルーブル・ランス）': 'On loan (Louvre-Lens)',
    '0階 · リシュリュー翼 · 偉人ギャラリー': 'Level 0 · Richelieu Wing · Galerie des Grands Hommes',
    '1階 · ドゥノン翼 · モリアン階段踊り場': 'Level 1 · Denon Wing · Mollien Staircase Landing',
    '現在 貸出中（バイヨンヌ・ボナ＝エリュー美術館）': 'On loan (Musée Bonnat-Helleu, Bayonne)',
    '現在 貸出中（シンガポール・アジア文明博物館）': 'On loan (Asian Civilisations Museum, Singapore)',
    '現在 貸出中（アラブ世界研究所）': 'On loan (Institut du Monde Arabe)',
    '現在 貸出中（メゾン＝ラフィット城）': 'On loan (Château de Maisons-Laffitte)'
  })
});

let currentLang = DEFAULT_LANG;

export function normalizeLang(value) {
  if (!value) return DEFAULT_LANG;
  const base = String(value).trim().toLowerCase().split(/[-_]/)[0];
  return Object.prototype.hasOwnProperty.call(DICTIONARIES, base) ? base : DEFAULT_LANG;
}

export function detectBrowserLang() {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = String(candidate).trim().toLowerCase().split(/[-_]/)[0];
    if (Object.prototype.hasOwnProperty.call(DICTIONARIES, base)) return base;
  }
  return DEFAULT_LANG;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  const next = normalizeLang(lang);
  currentLang = next;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = next;
  }
  return next;
}

export function getLangMeta(lang = currentLang) {
  const code = normalizeLang(lang);
  return SUPPORTED_LANGS.find(item => item.code === code) || SUPPORTED_LANGS[0];
}

export function t(key, params = null, lang = currentLang) {
  const code = normalizeLang(lang);
  const dict = DICTIONARIES[code] || DICTIONARIES[DEFAULT_LANG];
  let template = Object.prototype.hasOwnProperty.call(dict, key)
    ? dict[key]
    : Object.prototype.hasOwnProperty.call(DICTIONARIES[DEFAULT_LANG], key)
      ? DICTIONARIES[DEFAULT_LANG][key]
      : key;
  if (params && typeof template === 'string') {
    for (const [k, v] of Object.entries(params)) {
      template = template.replaceAll(`{${k}}`, String(v ?? ''));
    }
  }
  return template;
}

export function getFloorName(floor, lang = currentLang) {
  const key = `floor.${String(floor)}`;
  const dict = DICTIONARIES[normalizeLang(lang)] || DICTIONARIES[DEFAULT_LANG];
  return Object.prototype.hasOwnProperty.call(dict, key)
    ? dict[key]
    : t('floor.generic', {floor}, lang);
}

export function getFloorNavName(floor, lang = currentLang) {
  const key = `floorNav.${String(floor)}`;
  const dict = DICTIONARIES[normalizeLang(lang)] || DICTIONARIES[DEFAULT_LANG];
  return Object.prototype.hasOwnProperty.call(dict, key)
    ? dict[key]
    : t('floor.generic', {floor}, lang);
}

export function getWingName(wing, lang = currentLang) {
  if (!wing) return '';
  const key = `wing.${String(wing)}`;
  const dict = DICTIONARIES[normalizeLang(lang)] || DICTIONARIES[DEFAULT_LANG];
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : String(wing);
}

export function formatWingLocalized(wing, lang = currentLang) {
  if (!wing) return '';
  return t('wing.formatted', {wing: getWingName(wing, lang)}, lang);
}

export function localizeMapText(text, lang = currentLang) {
  const code = normalizeLang(lang);
  if (code === DEFAULT_LANG || !text) return String(text ?? '');
  const table = MAP_TEXT_TRANSLATIONS[code];
  if (table && Object.prototype.hasOwnProperty.call(table, text)) return table[text];
  return String(text);
}

export function localizeLocationLabel(label, lang = currentLang) {
  const code = normalizeLang(lang);
  if (code === DEFAULT_LANG || !label) return String(label ?? '');
  const table = LOCATION_LABEL_TRANSLATIONS[code];
  if (table && Object.prototype.hasOwnProperty.call(table, label)) return table[label];
  return String(label);
}

export function localizeRoute(route, lang = currentLang) {
  if (!route) return route;
  const code = normalizeLang(lang);
  const dict = DICTIONARIES[code] || DICTIONARIES[DEFAULT_LANG];
  const labelKey = `routes.${route.id}.label`;
  const subKey = `routes.${route.id}.subtitle`;
  const shortKey = `routes.${route.id}.short`;
  return {
    ...route,
    label: Object.prototype.hasOwnProperty.call(dict, labelKey) ? dict[labelKey] : route.label,
    subtitle: Object.prototype.hasOwnProperty.call(dict, subKey) ? dict[subKey] : route.subtitle,
    shortLabel: Object.prototype.hasOwnProperty.call(dict, shortKey)
      ? dict[shortKey]
      : (route.kind === 'theme' ? route.label.replace(/＆.*/, '').replace(/タイムトラベル/, '') : `${route.minutes}${t('course.minUnit', null, code)}`)
  };
}

export function registerWorkLocale(lang, entries) {
  const code = normalizeLang(lang);
  workLocaleOverrides.set(code, entries && typeof entries === 'object' ? entries : {});
}

export function hasWorkLocale(lang = currentLang) {
  const code = normalizeLang(lang);
  return code === DEFAULT_LANG || workLocaleOverrides.has(code);
}

const pendingWorkLocales = new Map();

export async function ensureWorkLocale(lang, appBase) {
  const code = normalizeLang(lang);
  if (code === DEFAULT_LANG || workLocaleOverrides.has(code)) return true;
  if (pendingWorkLocales.has(code)) return pendingWorkLocales.get(code);
  const promise = (async () => {
    try {
      const url = new URL(`src/locales/works.${code}.json`, appBase);
      const response = await fetch(url);
      if (!response.ok) return false;
      const data = await response.json();
      registerWorkLocale(code, data);
      return true;
    } catch {
      return false;
    } finally {
      pendingWorkLocales.delete(code);
    }
  })();
  pendingWorkLocales.set(code, promise);
  return promise;
}

export function localizeWork(work, lang = currentLang) {
  if (!work) return work;
  const code = normalizeLang(lang);
  if (code === DEFAULT_LANG) return work;
  const override = workLocaleOverrides.get(code)?.[work.id];
  const nextLocationLabel = work.locationLabel ? localizeLocationLabel(work.locationLabel, code) : work.locationLabel;
  if (!override && nextLocationLabel === work.locationLabel) return work;
  return {
    ...work,
    ...(override || {}),
    ...(nextLocationLabel !== undefined ? {locationLabel: nextLocationLabel} : {})
  };
}

export function getDictionaries() {
  return DICTIONARIES;
}
