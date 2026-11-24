-- Louvre Audio Map — Supabase Schema (Auth + Cloud Sync + Future Plan Sharing)
-- Supabase Dashboard > SQL Editor に貼り付けて 1 回実行するだけでセットアップ完了します。

-- 1. ユーザー設定プロフィール
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lang text not null default 'ja',
  prefer_elevator boolean not null default false,
  auto_play_next boolean not null default false,
  large_text boolean not null default false,
  duration integer not null default 60,
  playback_rate real not null default 1.0,
  updated_at timestamptz not null default now()
);

-- 2. ユーザーのマイプラン（将来の複数プラン・同行者共有用 slot / share_token / is_public を用意）
create table if not exists public.user_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slot text not null default 'default',
  title text not null default 'My Plan',
  work_ids text[] not null default '{}',
  plan_mode text not null default 'preset',
  route_id text not null default 'preset-90',
  minutes integer not null default 90,
  custom_timed_ids text[],
  custom_timed_minutes integer,
  share_token text unique,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (owner_id, slot)
);

-- 3. 鑑賞進捗（鑑賞済み作品ID・現在選択中の作品）
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  viewed_ids text[] not null default '{}',
  selected_work_id text,
  floor integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Row Level Security (RLS) 有効化
alter table public.user_profiles enable row level security;
alter table public.user_plans enable row level security;
alter table public.user_progress enable row level security;

-- 自分のデータのみ読み書き可能
drop policy if exists "users manage own profile" on public.user_profiles;
create policy "users manage own profile"
  on public.user_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own plans" on public.user_plans;
create policy "users manage own plans"
  on public.user_plans
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 将来の同行者プラン共有用: is_public = true かつ share_token 指定で閲覧のみ許可
drop policy if exists "anyone can read shared plans" on public.user_plans;
create policy "anyone can read shared plans"
  on public.user_plans
  for select
  using (is_public = true and share_token is not null);

drop policy if exists "users manage own progress" on public.user_progress;
create policy "users manage own progress"
  on public.user_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
