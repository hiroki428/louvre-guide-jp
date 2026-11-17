import assert from 'node:assert/strict';
import fs from 'node:fs';
import {audioLengthsFor, catalogWorks} from '../src/catalog.js';

const works = JSON.parse(fs.readFileSync(new URL('../src/works.json', import.meta.url), 'utf8'));
assert.equal(works.length, 203);
assert.equal(works.filter(work => Number.isInteger(work.catalogRank)).length, 200);
assert.equal(new Set(works.map(work => work.id)).size, works.length);
assert.equal(new Set(works.filter(work => work.catalogRank).map(work => work.catalogRank)).size, 200);
assert.equal(works.find(work => work.title === 'モナ・リザ').id, 'mona');
assert.equal(works.find(work => work.title === 'ナポレオン一世の戴冠式').locationPrecision, 'unknown');
assert.deepEqual(audioLengthsFor(works.find(work => work.title === 'ナポレオン一世の戴冠式')), [40]);
assert.equal(catalogWorks(works, {query:'モナ・リザ'}).length, 1);
assert.ok(catalogWorks(works, {query:'711'}).some(work => work.id === 'mona'));
for (const sort of ['room-asc', 'room-desc']) {
  const ordered = catalogWorks(works, {sort});
  const rooms = ordered.filter(work => work.room != null).map(work => Number(work.room));
  assert.deepEqual(rooms, [...rooms].sort((a, b) => sort === 'room-asc' ? a - b : b - a));
  assert.ok(ordered.slice(rooms.length).every(work => work.room == null));
}
assert.notEqual(catalogWorks(works, {sort:'title-asc'})[0].id, catalogWorks(works, {sort:'title-desc'})[0].id);
for (const work of works) for (const length of audioLengthsFor(work)) {
  const path = new URL(`../public/audio/${work.id}-${length}.wav`, import.meta.url);
  assert.ok(fs.existsSync(path), `missing audio: ${work.id}-${length}`);
  const header = Buffer.alloc(12);
  const file = fs.openSync(path, 'r');
  try { fs.readSync(file, header, 0, 12, 0); } finally { fs.closeSync(file); }
  assert.equal(header.toString('ascii', 0, 4), 'RIFF', `invalid audio: ${work.id}-${length}`);
  assert.equal(header.toString('ascii', 8, 12), 'WAVE', `invalid audio: ${work.id}-${length}`);
}
console.log('audio catalog: passed');
