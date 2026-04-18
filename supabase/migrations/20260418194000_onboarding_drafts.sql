-- Управляемый черновик онбординга (одна запись на пользователя)
create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  step integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Быстрый доступ по времени обновления (для аналитики/отладок)
create index if not exists onboarding_drafts_updated_at_idx
  on public.onboarding_drafts (updated_at desc);
