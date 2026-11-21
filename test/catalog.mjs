import assert from 'node:assert/strict';
import fs from 'node:fs';
import {audioLengthsFor, catalogWorks, priorityTierFor} from '../src/catalog.js';
import {formatWorkLocation} from '../src/app-config.js';

const works = JSON.parse(fs.readFileSync(new URL('../src/works.json', import.meta.url), 'utf8'));
assert.equal(works.length, 200, 'deduplicated catalog should contain 200 unique works');
assert.equal(new Set(works.map(work => work.id)).size, works.length);
assert.equal(new Set(works.map(work => work.title)).size, works.length, 'catalog must not contain duplicate titles');
const rankedCount = works.filter(work => Number.isInteger(work.catalogRank)).length;
assert.ok(rankedCount >= 199, 'almost all works should retain catalogRank');
assert.equal(new Set(works.filter(work => work.catalogRank).map(work => work.catalogRank)).size, rankedCount);
assert.ok(works.every(work => Boolean(work.author) && Boolean(work.year)), 'all 200 works must have author and year metadata');
assert.equal(works.find(work => work.title === 'モナ・リザ').id, 'mona');
assert.equal(works.find(work => work.title === 'ナポレオン一世の戴冠式').locationPrecision, 'room');
assert.equal(works.find(work => work.title === 'ナポレオン一世の戴冠式').room, '702');
assert.ok(works.filter(work => work.locationPrecision === 'room').length >= 155, 'official Louvre DB verification should resolve at least 155 room-verified works');
assert.equal(works.filter(work => formatWorkLocation(work) === '展示室：確認中').length, 0, 'no works should remain unverified after official Louvre DB check');
assert.match(formatWorkLocation(works.find(w => w.id === 'catalog-0023')), /貸出中/, 'loaned works must show loan status');
assert.match(formatWorkLocation(works.find(w => w.id === 'catalog-0010')), /非展示/, 'off-view works must show off-view status');
assert.deepEqual(audioLengthsFor(works.find(work => work.title === 'ナポレオン一世の戴冠式')), [60, 120]);

assert.deepEqual(priorityTierFor(works.find(w => w.id === 'mona')), {key: 'gold', label: '超有名', rank: 1});
assert.deepEqual(priorityTierFor(works.find(w => w.id === 'catalog-0009')), {key: 'silver', label: '有名', rank: 2});
assert.deepEqual(priorityTierFor(works.find(w => w.title === 'ケロスの頭部')), {key: 'bronze', label: '傑作', rank: 3});

assert.equal(catalogWorks(works, {query:'モナ・リザ'}).length, 1);
assert.ok(catalogWorks(works, {query:'モナリザ'}).some(work => work.id === 'mona'), 'search should ignore missing middle dot');
assert.ok(catalogWorks(works, {query:'もなりざ'}).some(work => work.id === 'mona'), 'search should match hiragana against katakana');
assert.ok(catalogWorks(works, {query:'ダビンチ'}).some(work => work.id === 'mona'), 'search should normalize ヴ and ビ variants');
assert.ok(catalogWorks(works, {query:'ふぇるめーる'}).some(work => work.id === 'lacemaker'), 'search should match author in hiragana');
assert.ok(catalogWorks(works, {query:'711'}).some(work => work.id === 'mona'));
assert.ok(catalogWorks(works, {query:'711'}).some(work => work.id === 'catalog-0003'), 'カナの婚礼 should match room 711');
assert.ok(catalogWorks(works, {query:'1830'}).some(work => work.id === 'liberty'), 'year search should match works');
assert.ok(catalogWorks(works, {filter:'mapped'}).every(work => work.locationPrecision === 'room'));
assert.ok(catalogWorks(works, {filter:'top'}).every(work => priorityTierFor(work).key === 'gold'));
assert.ok(catalogWorks(works, {filter:'famous'}).every(work => priorityTierFor(work).key === 'silver'));
assert.ok(catalogWorks(works, {filter:'masterpiece'}).every(work => priorityTierFor(work).key === 'bronze'));
assert.equal(catalogWorks(works, {filter:'myplan', myPlanIds:['mona', 'venus']}).length, 2);

const ranked = catalogWorks(works, {sort:'rank-asc'});
assert.equal(ranked[0].id, 'mona');
for (let i = 1; i < ranked.length; i += 1) {
  assert.ok(priorityTierFor(ranked[i - 1]).rank <= priorityTierFor(ranked[i]).rank, 'rank-asc must sort 超有名 >> 有名 >> 傑作');
}

for (const sort of ['room-asc', 'room-desc']) {
  const ordered = catalogWorks(works, {sort});
  const rooms = ordered.filter(work => work.room != null).map(work => Number(work.room));
  assert.deepEqual(rooms, [...rooms].sort((a, b) => sort === 'room-asc' ? a - b : b - a));
  assert.ok(ordered.slice(rooms.length).every(work => work.room == null));
}
assert.notEqual(catalogWorks(works, {sort:'title-asc'})[0].id, catalogWorks(works, {sort:'title-desc'})[0].id);
for (const work of works) for (const length of audioLengthsFor(work)) {
  const path = new URL(`../public/audio/${work.id}-${length}.mp3`, import.meta.url);
  assert.ok(fs.existsSync(path), `missing audio: ${work.id}-${length}`);
  const stat = fs.statSync(path);
  assert.ok(stat.size >= 1500, `audio file too small: ${work.id}-${length}`);
  const header = Buffer.alloc(3);
  const file = fs.openSync(path, 'r');
  try { fs.readSync(file, header, 0, 3, 0); } finally { fs.closeSync(file); }
  const isId3 = header.toString('ascii', 0, 3) === 'ID3';
  const isMpegSync = header[0] === 0xFF && (header[1] & 0xE0) === 0xE0;
  assert.ok(isId3 || isMpegSync, `invalid MP3 audio: ${work.id}-${length}`);
}
console.log('audio catalog: passed');
