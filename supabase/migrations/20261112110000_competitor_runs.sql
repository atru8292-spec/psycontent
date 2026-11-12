-- ─────────────────────────────────────────────────────────────────────────
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да». Применить ДО выкатки кода
-- ветки fix/do-oplaty: без таблицы шаг 1 разбора конкурента отказывает мягким
-- текстом (энергия не тратится), разбор не работает, пока таблицы нет.
--
-- Зачем: app/api/analyze-competitor тратит энергию (competitor_deep) только на
-- шаге 1, а шаги 2-4 (структура, что взять, готовый сценарий) прямым POST
-- шли без энергии и без лимита. Теперь шаг 1 заводит строку разбора, после
-- успешного списания ставит paid_at и отдает id в заголовке X-Analysis-Id.
-- Шаги 2-4 пускаются только с этим id: строка того же человека, оплачена, не
-- старше 24 часов, та же расшифровка (sha256), каждый шаг один раз (stepN_at
-- ставится условным update, на сбое модели снимается обратно).
--
-- Почему отдельная таблица, а не competitor_analyses: у competitor_analyses
-- есть политика insert для самого пользователя, он мог бы вставить себе
-- «оплаченную» строку. Здесь пишет только сервер (service_role): RLS включен,
-- политика только на чтение своих строк, insert/update/delete политик нет.
-- Новых SECURITY DEFINER функций нет.
--
-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ:
--   select relrowsecurity from pg_class where oid = 'public.competitor_runs'::regclass;  -- true
--   select policyname, cmd from pg_policies where tablename = 'competitor_runs';           -- одна, SELECT
--   Разбор конкурента целиком (4 шага) на тестовом входе, потом:
--   select paid_at is not null, step2_at, step3_at, step4_at from public.competitor_runs order by created_at desc limit 1;
--
-- ОТКАТ: drop table if exists public.competitor_runs;  (разбор снова не будет работать с кодом этой ветки)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.competitor_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_hash text not null,          -- sha256 расшифровки, сам текст здесь не храним
  paid_at timestamptz,                    -- null: шаг 1 еще не оплачен (или модель упала)
  step2_at timestamptz,
  step3_at timestamptz,
  step4_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_competitor_runs_user_created
  on public.competitor_runs (user_id, created_at desc);

alter table public.competitor_runs enable row level security;

drop policy if exists "Users can read own competitor runs" on public.competitor_runs;
create policy "Users can read own competitor runs" on public.competitor_runs
  for select using (auth.uid() = user_id);

-- Писать может только сервер: снимаем у клиентских ролей все, кроме чтения.
revoke insert, update, delete, truncate, references, trigger on public.competitor_runs from anon, authenticated;
revoke all on public.competitor_runs from anon;
grant select on public.competitor_runs to authenticated;
grant all on public.competitor_runs to service_role;
