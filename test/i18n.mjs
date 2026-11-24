import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DEFAULT_LANG,
  SUPPORTED_LANGS,
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
import {floorGeoData} from '../src/floor-map-geo.js';
import {buildNavigationView, indexNavigationGraph, navigationStateFromRoute} from '../src/navigation.js';
import {correctLocation, findRoomCandidates, normalizeRoomNumber} from '../src/location-support.js';
import {activePlanMeta, formatMinutesLabel, paceSummaryFor, planStopEstimates} from '../src/my-plan.js';

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const index = indexNavigationGraph(graph);

// 1. Dictionary parity across all supported languages
const dicts = getDictionaries();
const baseKeys = Object.keys(dicts[DEFAULT_LANG]).sort();
assert.ok(SUPPORTED_LANGS.some(l => l.code === 'ja'), 'ja must be supported');
assert.ok(SUPPORTED_LANGS.some(l => l.code === 'en'), 'en must be supported');
for (const {code} of SUPPORTED_LANGS) {
  const dict = dicts[code];
  assert.ok(dict, `dictionary for ${code} must exist`);
  const keys = Object.keys(dict).sort();
  assert.deepEqual(keys, baseKeys, `dictionary keys for ${code} must match ${DEFAULT_LANG}`);
  for (const key of keys) {
    assert.ok(typeof dict[key] === 'string' && dict[key].length > 0, `${code}.${key} must be non-empty string`);
  }
}

// 2. Language normalization, interpolation, and state switching
assert.equal(normalizeLang('en-US'), 'en');
assert.equal(normalizeLang('ja-JP'), 'ja');
assert.equal(normalizeLang('de-DE'), 'ja');
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

// 4. English route, plan, and room correction
assert.equal(normalizeRoomNumber('Room 711'), '711');
assert.equal(normalizeRoomNumber('Salle 711'), '711');
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

// 5. English SVG floor map contract (all 5 floors, HUD bounds, wing labels)
for (const floor of [2, 1, 0, -1, -2]) {
  const markup = floorMapMarkup({
    floor,
    floorLabel: getFloorName(floor, 'en'),
    works,
    selectedId: floor === 1 ? 'mona' : null,
    navigation: enNav,
    routeWorkIds: ['victory', 'mona', 'liberty'],
    viewedIds: ['victory'],
    lang: 'en'
  });
  const hudMatch = markup.match(/data-hud-bounds="([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)"/);
  assert.ok(hudMatch, `EN floor ${floor} must render HUD`);
  const [hx, hy, hw, hh] = hudMatch.slice(1).map(Number);
  assert.ok(hx + hw <= 202 && hy + hh <= 440, `EN floor ${floor} HUD (${hx},${hy},${hw}x${hh}) must stay inside top-left void`);
  assert.match(markup, /Next<\/text>/, `EN floor ${floor} HUD must use English labels`);
  if (floor === 2) {
    assert.doesNotMatch(markup, /Denon Wing/, 'EN floor 2 must not label Denon Wing');
    assert.match(markup, /Richelieu Wing/);
    assert.match(markup, /Sully Wing/);
  }
  if (floor === 1) {
    assert.match(markup, /Denon Wing/);
    assert.match(markup, /Closed/);
  }
  if (floor === -1) {
    assert.match(markup, /Studio/);
    assert.match(markup, /Rest Area/);
  }
  if (floor === -2) {
    assert.match(markup, /Exhibition/);
    assert.match(markup, /Exit/);
  }
}

// 6. English artwork locale pack (all 200 works, search, sorting, fallback)
const worksEn = JSON.parse(await readFile(new URL('../src/locales/works.en.json', import.meta.url), 'utf8'));
assert.equal(Object.keys(worksEn).length, works.length, 'works.en.json must cover all 200 works');
for (const work of works) {
  const entry = worksEn[work.id];
  assert.ok(entry, `works.en.json is missing entry for ${work.id}`);
  for (const field of ['title', 'author', 'year', 'background', 'look']) {
    assert.ok(typeof entry[field] === 'string' && entry[field].trim().length > 0, `works.en.json[${work.id}].${field} must be non-empty`);
    assert.doesNotMatch(entry[field], /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/, `works.en.json[${work.id}].${field} must not retain Japanese characters`);
  }
}
registerWorkLocale('en', worksEn);
const monaEn = localizeWork(mona, 'en');
assert.equal(monaEn.title, 'Mona Lisa');
assert.match(monaEn.author, /Leonardo da Vinci/i);
assert.ok(catalogWorks(works, {query: 'Mona Lisa', lang: 'en'}).some(w => w.id === 'mona'), 'English title search must match Mona Lisa');
assert.ok(catalogWorks(works, {query: 'Leonardo', lang: 'en'}).some(w => w.id === 'mona'), 'English artist search must match Mona Lisa');
assert.ok(catalogWorks(works, {query: 'モナリザ', lang: 'en'}).some(w => w.id === 'mona'), 'Japanese query should still match in English mode');

// Verify setLang restores cleanly
setLang('en');
assert.equal(getLang(), 'en');
setLang('ja');
assert.equal(getLang(), 'ja');

console.log('i18n (ja/en) contract: passed');
