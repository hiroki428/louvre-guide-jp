import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isSupabaseConfigured} from '../src/supabase-config.js';
import {
  createCloudSyncClient,
  mergeLocalAndCloudState,
  parseAuthHash
} from '../src/app/cloud-sync.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: key => map.delete(key)
  };
}

// 1. Default config stays safely disabled (guest-only mode without errors)
assert.equal(isSupabaseConfigured(), false, 'default empty Supabase config must stay disabled');
assert.equal(isSupabaseConfigured({url: 'https://demo.supabase.co', anonKey: 'sb_publishable_demo'}), true);
assert.equal(isSupabaseConfigured({url: 'invalid-url', anonKey: 'key'}), false);

// 2. Guest + Cloud union merge preserves both sides without losing guest progress
const local = {
  lang: 'ja',
  preferElevator: false,
  autoPlayNext: false,
  largeText: false,
  duration: 60,
  playbackRate: 1,
  myPlanIds: ['mona', 'venus'],
  viewed: new Set(['mona']),
  updatedAt: 1000
};
const cloud = {
  profile: {
    lang: 'en',
    prefer_elevator: true,
    auto_play_next: true,
    large_text: true,
    duration: 120,
    playback_rate: 1.25,
    updated_at: '2026-11-24T10:00:00Z'
  },
  plan: {work_ids: ['venus', 'victory']},
  progress: {viewed_ids: ['victory']}
};
const {merged, changed} = mergeLocalAndCloudState(local, cloud);
assert.equal(changed, true);
assert.deepEqual(merged.myPlanIds, ['mona', 'venus', 'victory'], 'myPlanIds must union-merge preserving local order');
assert.deepEqual([...merged.viewed].sort(), ['mona', 'victory'], 'viewed must union-merge without dropping guest items');
assert.equal(merged.lang, 'en', 'newer cloud settings should win');
assert.equal(merged.preferElevator, true);
assert.equal(merged.playbackRate, 1.25);

// Newer local timestamp preserves local settings while still union-merging plan & viewed
const localNewer = {...local, updatedAt: Date.parse('2026-12-01T00:00:00Z')};
const mergedLocalWins = mergeLocalAndCloudState(localNewer, cloud).merged;
assert.equal(mergedLocalWins.lang, 'ja', 'newer local settings must be preserved');
assert.equal(mergedLocalWins.preferElevator, false);
assert.deepEqual(mergedLocalWins.myPlanIds, ['mona', 'venus', 'victory']);

// 3. OAuth / Magic Link hash parsing
const parsed = parseAuthHash('#access_token=tok123&refresh_token=ref456&expires_in=3600&token_type=bearer');
assert.equal(parsed.access_token, 'tok123');
assert.equal(parsed.refresh_token, 'ref456');
assert.equal(parseAuthHash('#no-token'), null);

// 4. Mocked Supabase REST client: Google URL, Magic Link, pull, push (on_conflict=owner_id,slot)
const calls = [];
const mockFetch = async (url, init = {}) => {
  calls.push({url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null});
  if (String(url).includes('/auth/v1/user')) {
    return {ok: true, json: async () => ({id: 'user-1', email: 'visitor@example.com'})};
  }
  if (String(url).includes('/auth/v1/otp')) {
    return {ok: true, json: async () => ({})};
  }
  if (String(url).includes('/rest/v1/user_profiles') && (init.method || 'GET') === 'GET') {
    return {ok: true, json: async () => ([cloud.profile])};
  }
  if (String(url).includes('/rest/v1/user_plans') && (init.method || 'GET') === 'GET') {
    return {ok: true, json: async () => ([cloud.plan])};
  }
  if (String(url).includes('/rest/v1/user_progress') && (init.method || 'GET') === 'GET') {
    return {ok: true, json: async () => ([cloud.progress])};
  }
  return {ok: true, json: async () => ({})};
};

const storage = createMemoryStorage();
const client = createCloudSyncClient({
  url: 'https://demo.supabase.co',
  anonKey: 'sb_publishable_demo',
  fetchImpl: mockFetch,
  storage
});
assert.equal(client.configured, true);
assert.match(client.buildGoogleAuthUrl('https://sakai175.github.io/louvre-guide-jp/'), /provider=google/);

const invalidRes = await client.sendMagicLink('not-an-email', 'https://example.com');
assert.equal(invalidRes.ok, false);
assert.equal(invalidRes.error, 'invalid-email');

const okRes = await client.sendMagicLink('visitor@example.com', 'https://example.com');
assert.equal(okRes.ok, true);

const session = await client.restoreSessionFromHash('#access_token=tok123&refresh_token=ref456&expires_in=3600');
assert.equal(session.user.email, 'visitor@example.com');

const pulled = await client.pullCloudData(session);
assert.deepEqual(pulled.plan.work_ids, ['venus', 'victory']);

const pushed = await client.pushCloudData(session, {
  ...local,
  viewed: ['mona', 'victory'],
  myPlanIds: ['mona', 'venus', 'victory'],
  selected: 'venus',
  floor: 0
});
assert.equal(pushed, true);
assert.ok(calls.some(c => c.url.includes('/rest/v1/user_plans?on_conflict=owner_id,slot')), 'plans upsert must target unique (owner_id, slot)');

// 5. SQL schema contract check (RLS + future share_token)
const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
assert.match(schema, /enable row level security/i, 'RLS must be enabled on all user tables');
assert.match(schema, /share_token text unique/, 'user_plans must prepare share_token for future companion sharing');
assert.match(schema, /unique \(owner_id, slot\)/, 'user_plans must define unique (owner_id, slot) for upsert');

console.log('supabase auth & cloud sync contract: passed');
