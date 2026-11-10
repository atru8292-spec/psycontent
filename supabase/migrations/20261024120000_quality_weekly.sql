-- Качество и шаблонность текстов по неделям (аналитика 2, 24.10.2026). ПРИМЕНЕНА 22.10 вручную.
-- Пишет только скрипт scripts/quality-week.ts (service_role, раз в неделю cron на сервере), читает только кабинет
-- /admin/texts через service_role. ТОЛЬКО ЧИСЛА: ни текстов, ни цепочек слов, ни id людей тут нет.
-- Строка = неделя (пн-вс по ADMIN_TZ) × формат × вариант промпта; 'all' = по всем.

create table if not exists public.quality_weekly (
  week_start date not null,
  format text not null default 'all',     -- post, carousel, reels_*, stories, post_tg или all
  variant text not null default 'all',    -- вариант промпта из generated_posts.plan.prompt_hyp или pipeline_version, или all
  texts integer not null default 0,
  metrics jsonb not null default '{}'::jsonb check (pg_column_size(metrics) < 4096),
  computed_at timestamptz not null default now(),
  primary key (week_start, format, variant)
);

alter table public.quality_weekly enable row level security;
revoke all on public.quality_weekly from anon, authenticated;
