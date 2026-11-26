import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  buildSharedPlanUrl,
  decodeWorkId,
  encodeSharedPlanToken,
  encodeWorkId,
  generateQrMatrix,
  parseSharedPlanInput,
  readPendingSharedPlan,
  renderQrSvg,
  savePendingSharedPlan
} from '../src/app/plan-share.js';
import {activePlanMeta} from '../src/my-plan.js';
import {indexNavigationGraph} from '../src/navigation.js';

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const routes = JSON.parse(await readFile(new URL('../src/routes.json', import.meta.url), 'utf8'));
const graph = JSON.parse(await readFile(new URL('../src/navigation-graph.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(works.map(w => [w.id, w]));
const index = indexNavigationGraph(graph);

// 1. Compact work ID encoding/decoding round-trip across ALL 200 works
for (const work of works) {
  const encoded = encodeWorkId(work.id);
  assert.ok(encoded.length > 0 && encoded.length <= 8, `encoded token for ${work.id} should stay compact: ${encoded}`);
  assert.equal(decodeWorkId(encoded), work.id, `round-trip failed for ${work.id}`);
}

// 2. Shared plan URL build + parse
const sampleIds = ['mona', 'venus', 'catalog-0003', 'catalog-0042', 'mona', 'nonexistent-id'];
const shareUrl = buildSharedPlanUrl('https://sakai175.github.io/louvre-guide-jp/?old=1#hash', {
  ids: sampleIds,
  title: '友達の午前コース'
});
assert.ok(shareUrl.startsWith('https://sakai175.github.io/louvre-guide-jp/'));
assert.ok(!shareUrl.includes('#hash'));

const parsedFromUrl = parseSharedPlanInput(shareUrl, byId);
assert.ok(parsedFromUrl);
assert.deepEqual(parsedFromUrl.ids, ['mona', 'venus', 'catalog-0003', 'catalog-0042']);
assert.equal(parsedFromUrl.title, '友達の午前コース');

const parsedFromToken = parseSharedPlanInput(encodeSharedPlanToken(['victory', 'catalog-0010']), byId);
assert.deepEqual(parsedFromToken.ids, ['victory', 'catalog-0010']);
assert.equal(parseSharedPlanInput('https://example.com/?sp=invalid-work', byId), null);
assert.equal(parseSharedPlanInput('', byId), null);

// 3. Pending shared plan survives reloads via sessionStorage
{
  const map = new Map();
  const mem = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
  savePendingSharedPlan({ids: ['mona', 'venus'], title: '友達の午後プラン'}, mem);
  const restored = readPendingSharedPlan(byId, mem);
  assert.deepEqual(restored?.ids, ['mona', 'venus']);
  assert.equal(restored?.title, '友達の午後プラン');
  savePendingSharedPlan(null, mem);
  assert.equal(readPendingSharedPlan(byId, mem), null);
}

// 4. Shared plan metadata stays isolated from user's own myPlanIds
const sharedMeta = activePlanMeta({
  planMode: 'shared',
  routeId: 'preset-90',
  minutes: 90,
  routes,
  myPlanIds: ['liberty', 'scribe'],
  sharedPlan: {title: '友達のプラン', ids: ['mona', 'venus']},
  navigationIndex: index,
  lang: 'ja'
});
assert.equal(sharedMeta.isShared, true);
assert.equal(sharedMeta.isCustom, false);
assert.equal(sharedMeta.label, '友達のプラン');
assert.deepEqual(sharedMeta.ids, ['mona', 'venus']);

// 5. Zero-dependency QR Code generator structural verification
const shortQr = generateQrMatrix('https://sakai175.github.io/louvre-guide-jp/?sp=m0.m1.m2');
assert.ok(shortQr && shortQr.version >= 1 && shortQr.size === shortQr.version * 4 + 17);
assert.equal(shortQr.modules[0][0], 1);
assert.equal(shortQr.modules[3][3], 1);
assert.equal(shortQr.modules[0][shortQr.size - 1], 1);
assert.equal(shortQr.modules[shortQr.size - 1][0], 1);
assert.equal(shortQr.modules[4 * shortQr.version + 9][8], 1);

const longUrl = buildSharedPlanUrl('https://sakai175.github.io/louvre-guide-jp/', {
  ids: works.slice(0, 30).map(w => w.id),
  title: 'ルーブル美術館 じっくり1日満喫プラン'
});
const longQr = generateQrMatrix(longUrl);
assert.ok(longQr && longQr.version >= 7 && longQr.version <= 14);
const svg = renderQrSvg(shareUrl, {label: 'Test QR'});
assert.match(svg, /^<svg[^>]+class="share-qr-svg"/);
assert.match(svg, /<path d="M/);

console.log('plan share and QR code contract: passed');
