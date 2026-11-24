import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  BROWSER_FALLBACK_LANG,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  detectBrowserLang,
  formatWingLocalized,
  getDictionaries,
  getFloorName,
  getLang,
  localizeRoute,
  localizeWork,
  normalizeLang,
  registerWorkLocale,
  setLang,
  t
} from '../src/i18n.js';
import {formatWorkLocation} from '../src/app-config.js';
import {catalogWorks, normalizeSearchText, priorityTierFor} from '../src/catalog.js';
import {floorMapMarkup} from '../src/floor-map.js';
import {buildNavigationView, indexNavigationGraph, navigationStateFromRoute} from '../src/navigation.js';
import {correctLocation, findRoomCandidates, normalizeRoomNumber} from '../src/location-support.js';
import {activePlanMeta, formatMinutesLabel, paceSummaryFor, planStopEstimates} from '../src/my-plan.js';

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

const EXPECTED_LANGS = ['ja', 'en', 'fr', 'zh', 'ko', 'es'];

// 1. Dictionary parity across all 6 supported languages (keys + placeholders)
const dicts = getDictionaries();
const baseKeys = Object.keys(dicts[DEFAULT_LANG]).sort();
assert.deepEqual(SUPPORTED_LANGS.map(l => l.code), EXPECTED_LANGS, 'all 6 languages must be registered in order');

const placeholdersOf = str => [...new Set(String(str).match(/\{[a-zA-Z0-9_]+\}/g) || [])].sort();

for (const code of EXPECTED_LANGS) {
  const dict = dicts[code];
  assert.ok(dict, `dictionary for ${code} must exist`);
  const keys = Object.keys(dict).sort();
  assert.deepEqual(keys, baseKeys, `dictionary keys for ${code} must match ${DEFAULT_LANG}`);
  for (const key of keys) {
    assert.ok(typeof dict[key] === 'string' && dict[key].length > 0, `${code}.${key} must be non-empty string`);
    assert.deepEqual(
      placeholdersOf(dict[key]),
      placeholdersOf(dicts[DEFAULT_LANG][key]),
      `placeholders in ${code}.${key} must match ${DEFAULT_LANG}.${key}`
    );
  }
}

// 2. Language normalization, interpolation, and state switching
assert.equal(normalizeLang('en-US'), 'en');
assert.equal(normalizeLang('fr-FR'), 'fr');
assert.equal(normalizeLang('zh-CN'), 'zh');
assert.equal(normalizeLang('ko-KR'), 'ko');
assert.equal(normalizeLang('es-ES'), 'es');
assert.equal(normalizeLang('ja-JP'), 'ja');
assert.equal(normalizeLang('de-DE'), 'ja');
assert.equal(BROWSER_FALLBACK_LANG, 'en');
assert.equal(detectBrowserLang(['ja-JP', 'en-US']), 'ja');
assert.equal(detectBrowserLang(['fr-FR']), 'fr');
assert.equal(detectBrowserLang(['zh-Hans-CN']), 'zh');
assert.equal(detectBrowserLang(['ko-KR']), 'ko');
assert.equal(detectBrowserLang(['es-MX']), 'es');
assert.equal(detectBrowserLang(['de-DE', 'it-IT']), 'en', 'unsupported browser locales should fall back to English');
assert.equal(detectBrowserLang(['de-DE', 'ko-KR']), 'ko', 'first supported browser locale should win');
assert.equal(detectBrowserLang([]), DEFAULT_LANG);
assert.equal(getLang(), 'ja');
assert.equal(t('tabs.map', null, 'en'), 'Map');
assert.equal(t('map.viewedCount', {viewed: 3, total: 8}, 'en'), '3 / 8 viewed');
assert.equal(getFloorName(1, 'en'), 'Level 1');
assert.equal(formatWingLocalized('Denon', 'en'), 'Denon Wing');

// 3. Work location, tier, and multilingual search normalization
const mona = works.find(w => w.id === 'mona');
assert.equal(formatWorkLocation(mona, 'en'), 'Level 1 · Denon Wing · Room 711');
assert.equal(priorityTierFor(mona, 'en').label, 'Iconic');
const offView = works.find(w => w.id === 'catalog-0010');
assert.match(formatWorkLocation(offView, 'en'), /not on view/i);
const loaned = works.find(w => w.id === 'catalog-0023');
assert.match(formatWorkLocation(loaned, 'en'), /On loan/i);

// Latin diacritics fold cleanly without stripping Japanese dakuten
assert.equal(normalizeSearchText('Napoléon'), 'napoleon');
assert.equal(normalizeSearchText('Musée'), 'musee');
assert.notEqual(normalizeSearchText('が'), normalizeSearchText('か'), 'Japanese dakuten must remain distinct');
assert.ok(catalogWorks(works, {query: 'Denon', lang: 'en'}).some(w => w.id === 'mona'));
assert.ok(catalogWorks(works, {query: 'Iconic', lang: 'en'}).some(w => w.id === 'mona'));

// 4. Multilingual room normalization, route, plan, and room correction
assert.equal(normalizeRoomNumber('Room 711'), '711');
assert.equal(normalizeRoomNumber('Salle 711'), '711');
assert.equal(normalizeRoomNumber('Sala 711'), '711');
assert.equal(normalizeRoomNumber('711호'), '711');
const enCandidates = findRoomCandidates(index, works, 'Room 711', 'en');
assert.equal(enCandidates.length, 1);
assert.match(enCandidates[0].label, /Denon Wing · Level 1 · Room 711/);
assert.match(correctLocation(index, {destinationNodeId: 'work:liberty'}, 'missing', {lang: 'en'}).message, /room number/i);

const enRoute = localizeRoute(routes.find(r => r.id === 'preset-90'), 'en');
assert.equal(enRoute.label, '90-min Tour');
const enPlan = activePlanMeta({planMode: 'preset', routeId: 'preset-90', minutes: 90, routes, myPlanIds: [], navigationIndex: index, lang: 'en'});
assert.equal(enPlan.label, '90-min Tour');
assert.equal(formatMinutesLabel(45, 'en'), '45 min');
assert.equal(paceSummaryFor(90, 8, undefined, 'en').label, 'Balanced Pace');
const enEst = planStopEstimates(enPlan, index, {lang: 'en'});
assert.match(enEst.mona.elapsedLabel, /^Elapsed ~\d/);

const enNav = buildNavigationView(index, navigationStateFromRoute(index, ['victory', 'mona']), {lang: 'en'});
assert.equal(enNav.available, true);
assert.match(enNav.transitions[0].message, /Take .* floor\(s\) up to Level/);

// 5. All 6 languages SVG floor map contract (all 5 floors, HUD bounds, wing labels)
for (const lang of EXPECTED_LANGS) {
  const nav = buildNavigationView(index, navigationStateFromRoute(index, ['victory', 'mona']), {lang});
  for (const floor of [2, 1, 0, -1, -2]) {
    const markup = floorMapMarkup({
      floor,
      floorLabel: getFloorName(floor, lang),
      works,
      selectedId: floor === 1 ? 'mona' : null,
      navigation: nav,
      routeWorkIds: ['victory', 'mona', 'liberty'],
      viewedIds: ['victory'],
      lang
    });
    const hudMatch = markup.match(/data-hud-bounds="([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)"/);
    assert.ok(hudMatch, `${lang} floor ${floor} must render HUD`);
    const [hx, hy, hw, hh] = hudMatch.slice(1).map(Number);
    assert.ok(hx + hw <= 202 && hy + hh <= 440, `${lang} floor ${floor} HUD (${hx},${hy},${hw}x${hh}) must stay inside top-left void`);
  }
}

// 6. All 5 translated artwork locale packs (en, fr, zh, ko, es — 200 works each)
const packSamples = {
  en: {monaTitle: /Mona Lisa/i, query: 'Mona Lisa', noJapanRe: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/},
  fr: {monaTitle: /Joconde/i, query: 'Joconde', noJapanRe: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/},
  zh: {monaTitle: /蒙娜丽莎/, query: '蒙娜丽莎', noJapanRe: /[\u3040-\u309F\u30A0-\u30FF]/},
  ko: {monaTitle: /모나리자/, query: '모나리자', noJapanRe: /[\u3040-\u309F\u30A0-\u30FF]/},
  es: {monaTitle: /Gioconda|Mona Lisa/i, query: 'Gioconda', noJapanRe: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/}
};

for (const [lang, check] of Object.entries(packSamples)) {
  const pack = JSON.parse(await readFile(new URL(`../src/locales/works.${lang}.json`, import.meta.url), 'utf8'));
  assert.equal(Object.keys(pack).length, works.length, `works.${lang}.json must cover all 200 works`);
  for (const work of works) {
    const entry = pack[work.id];
    assert.ok(entry, `works.${lang}.json is missing entry for ${work.id}`);
    for (const field of ['title', 'author', 'year', 'background', 'look']) {
      assert.ok(typeof entry[field] === 'string' && entry[field].trim().length > 0, `works.${lang}.json[${work.id}].${field} must be non-empty`);
      assert.doesNotMatch(entry[field], check.noJapanRe, `works.${lang}.json[${work.id}].${field} must not retain Japanese text`);
    }
  }
  registerWorkLocale(lang, pack);
  const monaLoc = localizeWork(mona, lang);
  assert.match(monaLoc.title, check.monaTitle, `${lang} Mona Lisa title mismatch: ${monaLoc.title}`);
  assert.ok(catalogWorks(works, {query: check.query, lang}).some(w => w.id === 'mona'), `${lang} title search must match Mona Lisa`);
  assert.ok(catalogWorks(works, {query: 'モナリザ', lang}).some(w => w.id === 'mona'), `Japanese query should still match in ${lang} mode`);
}

// Verify setLang restores cleanly
setLang('fr');
assert.equal(getLang(), 'fr');
setLang('ja');
assert.equal(getLang(), 'ja');

console.log('i18n (6 languages: ja/en/fr/zh/ko/es) contract: passed');
