import {SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured} from '../supabase-config.js';

export const AUTH_STORAGE_KEY = 'louvre-auth-session-v1';
export const SYNC_META_KEY = 'louvre-sync-meta-v1';

/**
 * ゲスト中のローカルデータとクラウドデータを安全にマージする純粋関数。
 * - myPlanIds / viewed はどちらのデータも失われないよう和集合マージ（順序維持）
 * - 設定項目は updatedAt が新しい方を優先
 */
export function mergeLocalAndCloudState(localState, cloudData) {
  if (!cloudData) return {merged: localState, changed: false};
  const localPlan = Array.isArray(localState.myPlanIds) ? localState.myPlanIds : [];
  const cloudPlan = Array.isArray(cloudData.plan?.work_ids) ? cloudData.plan.work_ids : [];
  const mergedPlan = [...new Set([...localPlan, ...cloudPlan])];

  const localViewed = localState.viewed instanceof Set
    ? [...localState.viewed]
    : (Array.isArray(localState.viewed) ? localState.viewed : []);
  const cloudViewed = Array.isArray(cloudData.progress?.viewed_ids) ? cloudData.progress.viewed_ids : [];
  const mergedViewed = [...new Set([...localViewed, ...cloudViewed])];

  const localUpdatedAt = Number(localState.updatedAt || 0);
  const cloudProfileTs = cloudData.profile?.updated_at ? Date.parse(cloudData.profile.updated_at) : 0;
  const preferCloudSettings = cloudProfileTs > localUpdatedAt;

  const merged = {
    lang: preferCloudSettings && cloudData.profile?.lang ? cloudData.profile.lang : localState.lang,
    preferElevator: preferCloudSettings && typeof cloudData.profile?.prefer_elevator === 'boolean'
      ? cloudData.profile.prefer_elevator
      : localState.preferElevator,
    autoPlayNext: preferCloudSettings && typeof cloudData.profile?.auto_play_next === 'boolean'
      ? cloudData.profile.auto_play_next
      : localState.autoPlayNext,
    largeText: preferCloudSettings && typeof cloudData.profile?.large_text === 'boolean'
      ? cloudData.profile.large_text
      : localState.largeText,
    duration: preferCloudSettings && Number.isFinite(cloudData.profile?.duration)
      ? cloudData.profile.duration
      : localState.duration,
    playbackRate: preferCloudSettings && Number.isFinite(cloudData.profile?.playback_rate)
      ? cloudData.profile.playback_rate
      : localState.playbackRate,
    myPlanIds: mergedPlan,
    viewed: mergedViewed
  };

  const changed = mergedPlan.join('|') !== localPlan.join('|')
    || mergedViewed.sort().join('|') !== [...localViewed].sort().join('|')
    || merged.lang !== localState.lang
    || merged.preferElevator !== localState.preferElevator
    || merged.autoPlayNext !== localState.autoPlayNext
    || merged.largeText !== localState.largeText
    || merged.duration !== localState.duration
    || merged.playbackRate !== localState.playbackRate;

  return {merged, changed};
}

/**
 * URLハッシュ（Magic Link / OAuth リダイレクト戻り）からセッション情報を抽出する。
 */
export function parseAuthHash(hash) {
  if (!hash || !hash.includes('access_token=')) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const expiresIn = Number(params.get('expires_in') || 3600);
  return {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || '',
    token_type: params.get('token_type') || 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + expiresIn
  };
}

export function createCloudSyncClient({
  url = SUPABASE_URL,
  anonKey = SUPABASE_ANON_KEY,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  storage = typeof localStorage !== 'undefined' ? localStorage : null
} = {}) {
  const configured = isSupabaseConfigured({url, anonKey});
  const baseUrl = String(url || '').replace(/\/+$/, '');

  function readSession() {
    try {
      const raw = storage?.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (session) storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      else storage?.removeItem(AUTH_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  function readSyncMeta() {
    try {
      const raw = storage?.getItem(SYNC_META_KEY);
      return raw ? JSON.parse(raw) : {pending: false, lastSyncedAt: null, updatedAt: 0};
    } catch {
      return {pending: false, lastSyncedAt: null, updatedAt: 0};
    }
  }

  function writeSyncMeta(meta) {
    try {
      storage?.setItem(SYNC_META_KEY, JSON.stringify(meta));
    } catch { /* ignore */ }
  }

  function headers(accessToken = null, extra = {}) {
    return {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken || anonKey}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async function refreshSessionIfNeeded(session) {
    if (!configured || !session || !fetchImpl) return session;
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at - nowSec > 90) return session;
    if (!session.refresh_token) return null;
    const res = await fetchImpl(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({refresh_token: session.refresh_token})
    });
    if (!res.ok) {
      writeSession(null);
      return null;
    }
    const next = await res.json();
    const stored = {
      access_token: next.access_token,
      refresh_token: next.refresh_token || session.refresh_token,
      expires_at: next.expires_at || (nowSec + Number(next.expires_in || 3600)),
      user: next.user || session.user || null
    };
    writeSession(stored);
    return stored;
  }

  async function fetchCurrentUser(accessToken) {
    if (!configured || !accessToken || !fetchImpl) return null;
    const res = await fetchImpl(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: headers(accessToken)
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function restoreSessionFromHash(hash = typeof location !== 'undefined' ? location.hash : '') {
    if (!configured) return null;
    const parsed = parseAuthHash(hash);
    if (!parsed) return refreshSessionIfNeeded(readSession());
    const user = await fetchCurrentUser(parsed.access_token);
    if (!user) return null;
    const session = {...parsed, user};
    writeSession(session);
    return session;
  }

  function buildGoogleAuthUrl(redirectTo) {
    if (!configured) return '';
    const params = new URLSearchParams({
      provider: 'google',
      redirect_to: redirectTo
    });
    return `${baseUrl}/auth/v1/authorize?${params.toString()}`;
  }

  async function sendMagicLink(email, redirectTo) {
    if (!configured || !fetchImpl) return {ok: false, error: 'not-configured'};
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) return {ok: false, error: 'invalid-email'};
    const res = await fetchImpl(`${baseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        email: cleanEmail,
        create_user: true,
        options: {emailRedirectTo: redirectTo}
      })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.msg || ''; } catch { /* ignore */ }
      return {ok: false, error: detail || `http-${res.status}`};
    }
    return {ok: true};
  }

  async function signOut() {
    const session = readSession();
    writeSession(null);
    if (!configured || !session?.access_token || !fetchImpl) return;
    try {
      await fetchImpl(`${baseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: headers(session.access_token)
      });
    } catch { /* ignore offline logout */ }
  }

  async function pullCloudData(session) {
    if (!configured || !session?.user?.id || !fetchImpl) return null;
    const valid = await refreshSessionIfNeeded(session);
    if (!valid?.access_token) return null;
    const uid = encodeURIComponent(valid.user.id);
    const reqHeaders = headers(valid.access_token);
    const [profRes, planRes, progRes] = await Promise.all([
      fetchImpl(`${baseUrl}/rest/v1/user_profiles?user_id=eq.${uid}&select=*`, {headers: reqHeaders}),
      fetchImpl(`${baseUrl}/rest/v1/user_plans?owner_id=eq.${uid}&slot=eq.default&select=*`, {headers: reqHeaders}),
      fetchImpl(`${baseUrl}/rest/v1/user_progress?user_id=eq.${uid}&select=*`, {headers: reqHeaders})
    ]);
    if (!profRes.ok || !planRes.ok || !progRes.ok) throw new Error('cloud-pull-failed');
    const [profiles, plans, progresses] = await Promise.all([profRes.json(), planRes.json(), progRes.json()]);
    return {
      profile: profiles[0] || null,
      plan: plans[0] || null,
      progress: progresses[0] || null
    };
  }

  async function pushCloudData(session, snapshot) {
    if (!configured || !session?.user?.id || !fetchImpl) return false;
    const valid = await refreshSessionIfNeeded(session);
    if (!valid?.access_token) return false;
    const nowIso = new Date().toISOString();
    const uid = valid.user.id;
    const upsertHeaders = headers(valid.access_token, {Prefer: 'resolution=merge-duplicates,return=minimal'});

    const profileBody = {
      user_id: uid,
      lang: snapshot.lang || 'ja',
      prefer_elevator: Boolean(snapshot.preferElevator),
      auto_play_next: Boolean(snapshot.autoPlayNext),
      large_text: Boolean(snapshot.largeText),
      duration: Number(snapshot.duration) || 60,
      playback_rate: Number(snapshot.playbackRate) || 1,
      updated_at: nowIso
    };
    const progressBody = {
      user_id: uid,
      viewed_ids: Array.isArray(snapshot.viewed) ? snapshot.viewed : [...(snapshot.viewed || [])],
      selected_work_id: snapshot.selected || null,
      floor: Number.isFinite(snapshot.floor) ? snapshot.floor : 1,
      updated_at: nowIso
    };
    const planBody = {
      owner_id: uid,
      slot: 'default',
      title: 'My Plan',
      work_ids: Array.isArray(snapshot.myPlanIds) ? snapshot.myPlanIds : [],
      plan_mode: snapshot.planMode || 'preset',
      route_id: snapshot.routeId || 'preset-90',
      minutes: Number(snapshot.minutes) || 90,
      custom_timed_ids: Array.isArray(snapshot.customTimedIds) ? snapshot.customTimedIds : null,
      custom_timed_minutes: snapshot.customTimedMinutes ?? null,
      updated_at: nowIso
    };

    const [p1, p2, p3] = await Promise.all([
      fetchImpl(`${baseUrl}/rest/v1/user_profiles?on_conflict=user_id`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify(profileBody)
      }),
      fetchImpl(`${baseUrl}/rest/v1/user_progress?on_conflict=user_id`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify(progressBody)
      }),
      fetchImpl(`${baseUrl}/rest/v1/user_plans?on_conflict=owner_id,slot`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify(planBody)
      })
    ]);
    if (!p1.ok || !p2.ok || !p3.ok) throw new Error('cloud-push-failed');
    writeSyncMeta({pending: false, lastSyncedAt: nowIso, updatedAt: Date.now()});
    return true;
  }

  return {
    configured,
    readSession,
    writeSession,
    readSyncMeta,
    writeSyncMeta,
    restoreSessionFromHash,
    buildGoogleAuthUrl,
    sendMagicLink,
    signOut,
    pullCloudData,
    pushCloudData
  };
}

export function createAuthSyncController(ctx, client = createCloudSyncClient()) {
  const {state} = ctx;
  state.auth.configured = client.configured;
  const meta = client.readSyncMeta();
  state.auth.pending = Boolean(meta.pending);
  state.auth.lastSyncedAt = meta.lastSyncedAt || null;

  let pushTimer = null;

  function buildSnapshot() {
    return {
      lang: state.lang,
      preferElevator: state.preferElevator,
      autoPlayNext: state.autoPlayNext,
      largeText: state.largeText,
      duration: state.duration,
      playbackRate: state.playbackRate,
      myPlanIds: [...state.myPlanIds],
      viewed: [...state.viewed],
      selected: state.selected,
      floor: state.floor,
      planMode: state.planMode,
      routeId: state.routeId,
      minutes: state.minutes,
      customTimedIds: state.customTimedIds,
      customTimedMinutes: state.customTimedMinutes,
      updatedAt: client.readSyncMeta().updatedAt || 0
    };
  }

  function applyMerged(merged) {
    if (merged.lang && merged.lang !== state.lang) {
      ctx.setAppLang(merged.lang);
    }
    state.preferElevator = Boolean(merged.preferElevator);
    state.autoPlayNext = Boolean(merged.autoPlayNext);
    state.largeText = Boolean(merged.largeText);
    state.duration = merged.duration;
    state.playbackRate = merged.playbackRate;
    state.myPlanIds = merged.myPlanIds.filter(id => ctx.byId[id]);
    state.viewed = new Set(merged.viewed.filter(id => ctx.byId[id]));
    ctx.persistState({skipSync: true});
  }

  async function syncNow({silent = false} = {}) {
    if (!client.configured) return false;
    const session = client.readSession();
    if (!session?.user?.id) return false;
    if (state.offline) {
      state.auth.pending = true;
      client.writeSyncMeta({...client.readSyncMeta(), pending: true});
      return false;
    }
    state.auth.status = 'syncing';
    state.auth.error = '';
    if (!silent) ctx.render();
    try {
      const cloud = await client.pullCloudData(session);
      const {merged, changed} = mergeLocalAndCloudState(buildSnapshot(), cloud);
      if (changed) applyMerged(merged);
      await client.pushCloudData(session, buildSnapshot());
      const nextMeta = client.readSyncMeta();
      state.auth.status = 'idle';
      state.auth.pending = false;
      state.auth.lastSyncedAt = nextMeta.lastSyncedAt;
      if (!silent) {
        ctx.setNotice(ctx.t('auth.syncedNotice'), false, 3200);
        ctx.render();
      } else if (changed) {
        ctx.render();
      }
      return true;
    } catch {
      state.auth.status = 'error';
      state.auth.pending = true;
      client.writeSyncMeta({...client.readSyncMeta(), pending: true});
      if (!silent) ctx.render();
      return false;
    }
  }

  function schedulePush() {
    if (!client.configured) return;
    const session = client.readSession();
    if (!session?.user?.id) return;
    const now = Date.now();
    client.writeSyncMeta({...client.readSyncMeta(), pending: true, updatedAt: now});
    state.auth.pending = true;
    if (state.offline) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      syncNow({silent: true});
    }, 1500);
  }

  async function init() {
    if (!client.configured) return;
    try {
      const hadAuthHash = typeof location !== 'undefined' && location.hash.includes('access_token=');
      const session = await client.restoreSessionFromHash();
      if (hadAuthHash && typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      if (session?.user) {
        state.auth.user = session.user;
        await syncNow({silent: !hadAuthHash});
      }
    } catch { /* keep guest mode working smoothly */ }
  }

  function signInWithGoogle() {
    if (!client.configured || typeof location === 'undefined') return;
    const redirectTo = `${location.origin}${location.pathname}`;
    const target = client.buildGoogleAuthUrl(redirectTo);
    if (target) location.href = target;
  }

  async function signInWithEmail(email) {
    state.auth.emailDraft = String(email || '').trim();
    state.auth.message = '';
    state.auth.error = '';
    if (!state.auth.emailDraft || !state.auth.emailDraft.includes('@')) {
      state.auth.error = ctx.t('auth.invalidEmail');
      ctx.render();
      return false;
    }
    state.auth.status = 'sending';
    ctx.render();
    const redirectTo = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
    const res = await client.sendMagicLink(state.auth.emailDraft, redirectTo);
    state.auth.status = 'idle';
    if (res.ok) {
      state.auth.message = ctx.t('auth.linkSent');
    } else {
      state.auth.error = ctx.t('auth.sendFailed');
    }
    ctx.render();
    return res.ok;
  }

  async function signOut() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    await client.signOut();
    state.auth.user = null;
    state.auth.status = 'idle';
    state.auth.pending = false;
    state.auth.message = '';
    state.auth.error = '';
    ctx.setNotice(ctx.t('auth.signedOutNotice'), false, 3400);
    ctx.render();
  }

  function flushPending() {
    if (state.auth.pending && state.auth.user && !state.offline) {
      syncNow({silent: true});
    }
  }

  ctx.setPersistListener(schedulePush);

  return {
    init,
    syncNow,
    schedulePush,
    flushPending,
    signInWithGoogle,
    signInWithEmail,
    signOut
  };
}
