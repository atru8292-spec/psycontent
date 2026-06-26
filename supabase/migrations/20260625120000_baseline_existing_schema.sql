-- ─────────────────────────────────────────────────────────────────────────
-- БАЗОВЫЙ СНИМОК СУЩЕСТВУЮЩЕЙ СХЕМЫ (snapshot прод-базы на 25 июня 2026)
-- Это «чертёж» для восстановления: 9 рабочих таблиц как они есть в проде.
-- Все CREATE — с IF NOT EXISTS, поэтому файл безопасно запускать и на проде
-- (там таблицы уже есть → ничего не произойдёт), и на чистой базе (создаст всё).
-- RLS-политики идут отдельным файлом-миграцией (см. следующий файл).
-- ─────────────────────────────────────────────────────────────────────────

-- ── onboarding_profiles — ответы распаковки/паспорт (ядро профиля) ──
create table if not exists public.onboarding_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  appeal text,
  approaches jsonb,
  niches jsonb,
  one_niche text,
  experience text,
  path_to_profession text,
  formats jsonb,
  price text,
  tone_formal smallint default 50,
  tone_serious smallint default 50,
  tone_cautious smallint default 50,
  tone_verbal text,
  values jsonb,
  values_custom text,
  anti_values jsonb,
  anti_values_custom text,
  superpowers jsonb,
  content_struggles jsonb,
  live_voice text,
  client_avatar text,
  client_job text,
  client_pain_phrases text,
  client_tried jsonb,
  client_fear jsonb,
  client_result text,
  platforms jsonb,
  current_followers text,
  current_clients text,
  client_source jsonb,
  content_pain text,
  content_pain_detail text,
  desired_clients text,
  goal_3_months text,
  time_available text,
  video_attitude text,
  dream_blog text,
  idols text,
  idols_why jsonb,
  something_else text,
  completed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id)
);

-- ── onboarding_answers — сырые ответы онбординга ──
create table if not exists public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  answers jsonb not null,
  completed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ── brand_passports — готовый паспорт бренда ──
create table if not exists public.brand_passports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content text,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  chunks_done integer[] default '{}'::integer[],
  unique (user_id)
);

-- ── brand_passport_drafts — черновик паспорта по частям ──
create table if not exists public.brand_passport_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parts jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create unique index if not exists brand_passport_drafts_user_id_idx
  on public.brand_passport_drafts (user_id);

-- ── content_plans — контент-план пользователя ──
create table if not exists public.content_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan jsonb not null default '[]'::jsonb,
  generated_at timestamptz default now(),
  unique (user_id)
);

-- ── researched_topics — подобранные темы ──
create table if not exists public.researched_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  topics jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique (user_id)
);

-- ── generated_posts — сохранённые сгенерированные посты ──
create table if not exists public.generated_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  topic text,
  format text,
  category text,
  content text not null,
  source text default 'generator'::text,
  is_favorite boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_generated_posts_user
  on public.generated_posts (user_id);
create index if not exists idx_generated_posts_created
  on public.generated_posts (created_at desc);

-- ── competitor_analyses — разборы конкурентов ──
create table if not exists public.competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  platform text,
  transcript text,
  metadata jsonb,
  analysis text,
  created_at timestamptz default now()
);
create index if not exists idx_competitor_analyses_user_id
  on public.competitor_analyses (user_id);

-- ── user_settings — настройки (сейчас хранит выбранную модель) ──
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preferred_model text not null default 'anthropic/claude-sonnet-4-5'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);
