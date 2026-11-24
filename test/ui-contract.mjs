import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';

async function loadSplitUiSources() {
  const appFiles = (await readdir(new URL('../src/app/', import.meta.url))).filter(f => f.endsWith('.js')).sort();
  const viewFiles = (await readdir(new URL('../src/views/', import.meta.url))).filter(f => f.endsWith('.js')).sort();
  const localeFiles = (await readdir(new URL('../src/locales/', import.meta.url))).filter(f => f.endsWith('.js')).sort();
  const parts = [
    await readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    await readFile(new URL('../src/i18n.js', import.meta.url), 'utf8')
  ];
  for (const f of appFiles) parts.push(await readFile(new URL(`../src/app/${f}`, import.meta.url), 'utf8'));
  for (const f of viewFiles) parts.push(await readFile(new URL(`../src/views/${f}`, import.meta.url), 'utf8'));
  for (const f of localeFiles) parts.push(await readFile(new URL(`../src/locales/${f}`, import.meta.url), 'utf8'));
  return {
    combined: parts.join('\n'),
    mapTabFile: await readFile(new URL('../src/views/map-tab.js', import.meta.url), 'utf8'),
    splitPaths: [
      './src/i18n.js',
      ...localeFiles.map(f => `./src/locales/${f}`),
      ...appFiles.map(f => `./src/app/${f}`),
      ...viewFiles.map(f => `./src/views/${f}`)
    ]
  };
}

const {combined: main, mapTabFile, splitPaths} = await loadSplitUiSources();
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const css = await readFile(new URL('../src/update.css', import.meta.url), 'utf8');
const support = await readFile(new URL('../src/location-support.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../src/app-config.js', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

assert.match(config, /APP_NAME = 'Louvre Audio Map'/, 'app name must be Louvre Audio Map');
assert.match(indexHtml, /icons\/icon-192\.png/, 'index.html must reference custom app icon');
assert.match(indexHtml, /icons\/apple-touch-icon\.png/, 'index.html must reference apple-touch-icon');
assert.ok(manifest.icons.some(i => i.src.includes('icon-512.png')), 'manifest must include custom 512px PNG icon');
assert.match(sw, /icons\/icon-192\.png/, 'Service Worker must cache custom app icons');
assert.match(main, /class="splash-mona-frame"/, 'Mona Lisa opening popup frame must be rendered on splash');
assert.match(main, /images\/mona\.jpg/, 'Mona Lisa opening popup must reference local mona.jpg');
assert.match(main, /class="theme-courses-disclosure"/, 'theme courses must be collapsible on the initial selection screen');
assert.ok(routes.filter(r => r.kind === 'theme').length >= 3, 'at least 3 themed courses should be available');
assert.match(main, /data-facility-filter="wc"/, 'toilet pickup sub-tab must exist');
assert.match(main, /data-facility-filter="cafe"/, 'cafe pickup sub-tab must exist');
assert.match(main, /data-prefer-elevator/, 'route priority toggle (shortest vs elevator) must exist');
assert.match(main, /data-toggle-autoplay/, 'continuous playback toggle must exist');
assert.match(main, /data-set-large-text/, 'text size toggle must exist');
assert.match(main, /data-clear-search/, 'search clear button must exist');
assert.match(main, /data-pick-minutes/, 'step 1 time picker must exist');
assert.match(main, /data-count-slider/, 'step 2 work count slider must exist');
assert.match(main, /data-count-input/, 'step 2 numeric work count input must exist');
assert.match(main, /この時間の限界目安/, 'limit guidance for chosen duration must be displayed');
assert.match(main, /data-start-timed-route/, 'start button for timed custom-count route must exist');
assert.match(main, /data-optimize-myplan/, 'my-plan shortest-order optimize button must exist');
assert.match(main, /route-loader-overlay/, 'route designing loading overlay must exist');
assert.match(css, /\.route-loader-overlay/, 'route designing loading overlay styles must exist');
const mapTabSection = mapTabFile.slice(mapTabFile.indexOf('export function mapTabView('));
assert.match(mapTabSection, /<main class="tab-screen map-screen[^"]*">\s*<div class="map-frame">/, 'map-frame must appear at the very top of the Map tab');
assert.doesNotMatch(mapTabSection, /navigationPanel\(/, 'bulky route-guidance card must not appear in the Map tab');
assert.match(main, /offline-pill/, 'online/offline status pill must exist');
assert.match(main, /planStopEstimates/, 'cumulative elapsed time estimates must be wired');
assert.doesNotMatch(main, /data-focus-destination/, 'auto-zoom button must not be added per user preference');
assert.doesNotMatch(main, /data-work-note/, 'memo feature must not be added per user preference');

assert.match(main, /<details class="movement-support"/, 'movement support must be collapsible below the map');
assert.match(main, /現在地を修正する/);
assert.match(main, /道に迷ったとき/);
assert.match(main, /部屋番号を確認してください/);
assert.match(main, /この地点から経路を作成できません。別の部屋番号を入力してください/);
assert.match(support, /map\.errRouteFromHere/);
assert.match(main, /情報更新日：\{date\}/);
assert.match(main, /sources\.checkedAt/);
assert.match(main, /ご利用前の確認・情報について/);
assert.match(main, /sources\.officialMap/);
assert.match(main, /sources\.availability/);
assert.match(main, /公認サービスではありません/);
assert.doesNotMatch(main, /map-caution|route-data-note|GPS現在地|GPS不使用/);
assert.doesNotMatch(main, /単独再生/, 'audio rows must show tier badges instead of 単独再生');
assert.doesNotMatch(main, /作品タップで解説を読みながら再生できます/, 'verbose audio catalog intro paragraph must stay removed');
assert.match(main, /'tabs\.map': 'マップ'/);
assert.match(main, /'tabs\.plan': 'プラン一覧'/);
assert.match(main, /'tabs\.audio': '音声一覧'/);
assert.match(main, /'tabs\.settings': '案内・設定'/);
assert.match(main, /data-set-lang/, 'language switcher controls must exist');
assert.match(main, /data-change-course/);
assert.doesNotMatch(mapTabSection, /floor-jump-banner|data-jump-floor/, 'floor jump banner must not be shown on the Map tab per user preference');
assert.match(main, /data-mini-prev/, 'Spotify-style player must provide ⏮ previous control');
assert.match(main, /data-mini-play/, 'Spotify-style player must provide ▶/⏸ toggle');
assert.match(main, /data-mini-next/, 'Spotify-style player must provide ⏭ next/complete control');
assert.match(main, /data-mini-close/, 'mini player must provide ✕ close/dismiss button');
assert.match(main, /data-seek/, 'Spotify-style player must provide interactive seek bar');
assert.match(main, /data-open-audio-settings/, 'top-right audio settings trigger must exist');
assert.match(main, /data-rate-slider/, 'audio settings must include playback speed adjustment');
assert.match(main, /data-bulk-download/, 'offline bulk course download must be provided');
assert.match(main, /mediaSession/, 'Media Session API integration must be wired');
assert.match(sw, /floor-map-geo\.js/, 'Service Worker must cache floor-map-geo.js for offline map support');
for (const assetPath of splitPaths) {
  assert.ok(sw.includes(`'${assetPath}'`), `Service Worker must cache split module ${assetPath}`);
}
assert.equal(routes.some(route => route.minutes === 60), false, 'the 60 minute route must not be offered');
assert.match(css, /\.tier-badge\.tier-gold/, 'gold badge style required for 超有名');
assert.match(css, /\.tier-badge\.tier-silver/, 'silver badge style required for 有名');
assert.match(css, /\.tier-badge\.tier-bronze/, 'bronze badge style required for 傑作');
assert.match(css, /\.room-input-row input \{[^}]*min-height:\s*44px/s, 'room input needs a mobile tap target');
assert.match(css, /\.bottom-tabs \{[^}]*position:\s*fixed;[^}]*bottom:\s*0/s, 'bottom tabs must be fixed at the bottom for one-handed use');

console.log('support and information UI contract: passed');
