import {ja} from './locales/ja.js';
import {en} from './locales/en.js';
import {fr} from './locales/fr.js';
import {zh} from './locales/zh.js';
import {ko} from './locales/ko.js';
import {es} from './locales/es.js';

export const DEFAULT_LANG = 'ja';

export const SUPPORTED_LANGS = Object.freeze([
  {code: 'ja', label: '日本語', shortLabel: '日本語'},
  {code: 'en', label: 'English', shortLabel: 'EN'},
  {code: 'fr', label: 'Français', shortLabel: 'FR'},
  {code: 'zh', label: '简体中文', shortLabel: '中文'},
  {code: 'ko', label: '한국어', shortLabel: '한국어'},
  {code: 'es', label: 'Español', shortLabel: 'ES'}
]);

const DICTIONARIES = Object.freeze({ja, en, fr, zh, ko, es});

// Optional work-level translation overlay maps registered per language (lazy-loaded JSON packs).
const workLocaleOverrides = new Map();

// Fixed labels embedded in generated floor-map-geo.js
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
  }),
  fr: Object.freeze({
    'リシュリュー翼': 'Aile Richelieu',
    'シュリー翼': 'Aile Sully',
    'ドゥノン翼': 'Aile Denon',
    '工事中（閉鎖）': 'Fermé',
    '工事中': 'Fermé',
    'ステュディオ': 'Le Studio',
    '休憩エリア': 'Espace repos',
    '企画展': 'Exposition',
    '特別展示': 'Expo temp.',
    '出口': 'Sortie',
    'ナポレオンホール': 'Hall Napoléon',
    'ピラミッド中央入口': 'Entrée Pyramide',
    'ナポレオン・ホール中央': 'Centre Hall Napoléon'
  }),
  zh: Object.freeze({
    'リシュリュー翼': '黎塞留馆',
    'シュリー翼': '叙利馆',
    'ドゥノン翼': '德农馆',
    '工事中（閉鎖）': '施工关闭',
    '工事中': '施工中',
    'ステュディオ': '工作室',
    '休憩エリア': '休息区',
    '企画展': '特展',
    '特別展示': '特别展览',
    '出口': '出口',
    'ナポレオンホール': '拿破仑大厅',
    'ピラミッド中央入口': '金字塔主入口',
    'ナポレオン・ホール中央': '拿破仑大厅中央'
  }),
  ko: Object.freeze({
    'リシュリュー翼': '리슐리외관',
    'シュリー翼': '쉴리관',
    'ドゥノン翼': '드농관',
    '工事中（閉鎖）': '공사 중',
    '工事中': '공사 중',
    'ステュディオ': '스튜디오',
    '休憩エリア': '휴식 공간',
    '企画展': '기획전',
    '特別展示': '특별전',
    '出口': '출구',
    'ナポレオンホール': '나폴레옹 홀',
    'ピラミッド中央入口': '피라미드 중앙 입구',
    'ナポレオン・ホール中央': '나폴레옹 홀 중앙'
  }),
  es: Object.freeze({
    'リシュリュー翼': 'Ala Richelieu',
    'シュリー翼': 'Ala Sully',
    'ドゥノン翼': 'Ala Denon',
    '工事中（閉鎖）': 'Cerrado',
    '工事中': 'Cerrado',
    'ステュディオ': 'El Estudio',
    '休憩エリア': 'Zona de descanso',
    '企画展': 'Exposición',
    '特別展示': 'Expo temp.',
    '出口': 'Salida',
    'ナポレオンホール': 'Hall Napoléon',
    'ピラミッド中央入口': 'Entrada Pirámide',
    'ナポレオン・ホール中央': 'Centro Hall Napoléon'
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
  }),
  fr: Object.freeze({
    '現在 非展示（公式収蔵DB）': 'Non exposé actuellement (Louvre DB)',
    '現在 貸出中（ルーブル・アブダビ）': 'En prêt (Louvre Abou Dabi)',
    '現在 貸出中（アルル古代博物館）': 'En prêt (Musée départemental Arles antique)',
    '現在 貸出中（フォンテーヌブロー宮殿）': 'En prêt (Château de Fontainebleau)',
    '現在 貸出中（ルーブル・ランス）': 'En prêt (Louvre-Lens)',
    '0階 · リシュリュー翼 · 偉人ギャラリー': 'Niveau 0 · Aile Richelieu · Galerie des Grands Hommes',
    '1階 · ドゥノン翼 · モリアン階段踊り場': 'Niveau 1 · Aile Denon · Escalier Mollien',
    '現在 貸出中（バイヨンヌ・ボナ＝エリュー美術館）': 'En prêt (Musée Bonnat-Helleu, Bayonne)',
    '現在 貸出中（シンガポール・アジア文明博物館）': 'En prêt (Asian Civilisations Museum, Singapour)',
    '現在 貸出中（アラブ世界研究所）': 'En prêt (Institut du Monde Arabe)',
    '現在 貸出中（メゾン＝ラフィット城）': 'En prêt (Château de Maisons-Laffitte)'
  }),
  zh: Object.freeze({
    '現在 非展示（公式収蔵DB）': '目前未展出（卢浮宫官方数据库）',
    '現在 貸出中（ルーブル・アブダビ）': '目前外借中（阿布扎比卢浮宫）',
    '現在 貸出中（アルル古代博物館）': '目前外借中（阿尔勒古代博物馆）',
    '現在 貸出中（フォンテーヌブロー宮殿）': '目前外借中（枫丹白露宫）',
    '現在 貸出中（ルーブル・ランス）': '目前外借中（卢浮宫朗斯分馆）',
    '0階 · リシュリュー翼 · 偉人ギャラリー': '0层 · 黎塞留馆 · 伟人长廊',
    '1階 · ドゥノン翼 · モリアン階段踊り場': '1层 · 德农馆 · 莫利安楼梯平台',
    '現在 貸出中（バイヨンヌ・ボナ＝エリュー美術館）': '目前外借中（巴约讷博纳-埃勒美术馆）',
    '現在 貸出中（シンガポール・アジア文明博物館）': '目前外借中（新加坡亚洲文明博物馆）',
    '現在 貸出中（アラブ世界研究所）': '目前外借中（阿拉伯世界研究所）',
    '現在 貸出中（メゾン＝ラフィット城）': '目前外借中（梅宗拉菲特城堡）'
  }),
  ko: Object.freeze({
    '現在 非展示（公式収蔵DB）': '현재 미전시 (루브르 공식 DB)',
    '現在 貸出中（ルーブル・アブダビ）': '현재 대여 중 (루브르 아부다비)',
    '現在 貸出中（アルル古代博物館）': '현재 대여 중 (아를 고대 박물관)',
    '現在 貸出中（フォンテーヌブロー宮殿）': '현재 대여 중 (퐁텐블로 궁전)',
    '現在 貸出中（ルーブル・ランス）': '현재 대여 중 (루브르 랑스)',
    '0階 · リシュリュー翼 · 偉人ギャラリー': '0층 · 리슐리외관 · 위인 갤러리',
    '1階 · ドゥノン翼 · モリアン階段踊り場': '1층 · 드농관 · 몰리앙 계단 참',
    '現在 貸出中（バイヨンヌ・ボナ＝エリュー美術館）': '현재 대여 중 (바욘 보나-엘뢰 미술관)',
    '現在 貸出中（シンガポール・アジア文明博物館）': '현재 대여 중 (싱가포르 아시아 문명 박물관)',
    '現在 貸出中（アラブ世界研究所）': '현재 대여 중 (아랍 세계 연구소)',
    '現在 貸出中（メゾン＝ラフィット城）': '현재 대여 중 (메종-라피트 성)'
  }),
  es: Object.freeze({
    '現在 非展示（公式収蔵DB）': 'Actualmente no expuesta (BD Louvre)',
    '現在 貸出中（ルーブル・アブダビ）': 'En préstamo (Louvre Abu Dabi)',
    '現在 貸出中（アルル古代博物館）': 'En préstamo (Museo Departamental Arles Antiguo)',
    '現在 貸出中（フォンテーヌブロー宮殿）': 'En préstamo (Palacio de Fontainebleau)',
    '現在 貸出中（ルーブル・ランス）': 'En préstamo (Louvre-Lens)',
    '0階 · リシュリュー翼 · 偉人ギャラリー': 'Planta 0 · Ala Richelieu · Galería de los Grandes Hombres',
    '1階 · ドゥノン翼 · モリアン階段踊り場': 'Planta 1 · Ala Denon · Escalera Mollien',
    '現在 貸出中（バイヨンヌ・ボナ＝エリュー美術館）': 'En préstamo (Museo Bonnat-Helleu, Bayona)',
    '現在 貸出中（シンガポール・アジア文明博物館）': 'En préstamo (Museo de Civilizaciones Asiáticas, Singapur)',
    '現在 貸出中（アラブ世界研究所）': 'En préstamo (Instituto del Mundo Árabe)',
    '現在 貸出中（メゾン＝ラフィット城）': 'En préstamo (Castillo de Maisons-Laffitte)'
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
