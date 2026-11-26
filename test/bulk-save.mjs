import assert from 'node:assert/strict';
import {createAudioController} from '../src/app/audio-controller.js';

globalThis.Audio = class { preload = ''; playbackRate = 1; };
globalThis.window = {caches: {}};
const fetched = [];
globalThis.fetch = async url => {
  fetched.push(url);
  return {ok: true, clone: () => ({})};
};
globalThis.caches = {open: async () => ({put: async () => {}})};

const works = [{id: 'mona'}, {id: 'venus'}, {id: 'victory'}];
const notices = [];
const ctx = {
  state: {
    lang: 'ja', playbackRate: 1, downloaded: new Set(), audioDurations: {},
    bulkDownload: {active: false, done: 0, total: 0}
  },
  planWorks: () => works,
  preferredLengthFor: () => 60,
  audioPath: (id, length, lang) => `/audio/${lang}/${id}-${length}.mp3`,
  render: () => {},
  setNotice: message => notices.push(message)
};
const audio = createAudioController(ctx);

await audio.downloadCurrentPlanAudio(['venus']);
assert.deepEqual(fetched, ['/audio/ja/venus-60.mp3'], 'only the selected artwork should be fetched');
assert.deepEqual([...ctx.state.downloaded], ['venus-60']);
assert.match(notices.at(-1), /1 \/ 1作品/);

await audio.downloadCurrentPlanAudio([]);
assert.equal(fetched.length, 1, 'an empty selection must never save the whole plan');

await audio.downloadCurrentPlanAudio(['mona', 'victory']);
assert.deepEqual(fetched.slice(1), ['/audio/ja/mona-60.mp3', '/audio/ja/victory-60.mp3']);

console.log('selected bulk audio save: passed');
