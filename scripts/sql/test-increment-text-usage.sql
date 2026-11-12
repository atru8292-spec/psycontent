-- Проверка increment_text_usage на ОТДЕЛЬНОЙ временной базе (не на боевом Supabase).
-- Запуск из корня репозитория (файл миграции подключается относительным путем):
--   bash scripts/sql/test-increment-text-usage.sh "postgres://USER:PASS@HOST:PORT/psy_tmp"
-- Сам по себе этот файл: готовит базу, подключает настоящую миграцию, проверяет последовательные
-- вызовы и права. Параллельная часть (200 вызовов) в .sh через pgbench или xargs.
\set ON_ERROR_STOP on

-- 1) Заглушки того, что в Supabase есть само: роли и auth.users (на нее ссылается счетчик).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

-- 2) Таблица как в 20260625130000_energy_foundation.sql.
drop table if exists public.text_usage_counter cascade;
create table public.text_usage_counter (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  count integer not null default 0,
  primary key (user_id, period)
);
alter table public.text_usage_counter enable row level security;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- 3) Настоящая миграция из репозитория.
\i supabase/migrations/20261112100100_increment_text_usage.sql

-- 4) Последовательно: первый вызов создает строку с 1, дальше +1, периоды и люди раздельно.
do $$
declare v int;
begin
  v := public.increment_text_usage('11111111-1111-1111-1111-111111111111', '2026-11');
  if v <> 1 then raise exception 'первый вызов вернул %, ждали 1', v; end if;
  v := public.increment_text_usage('11111111-1111-1111-1111-111111111111', '2026-11');
  if v <> 2 then raise exception 'второй вызов вернул %, ждали 2', v; end if;
  v := public.increment_text_usage('11111111-1111-1111-1111-111111111111', '2026-12');
  if v <> 1 then raise exception 'другой период вернул %, ждали 1', v; end if;
  v := public.increment_text_usage('22222222-2222-2222-2222-222222222222', '2026-11');
  if v <> 1 then raise exception 'другой человек вернул %, ждали 1', v; end if;
  select count into v from public.text_usage_counter
   where user_id = '11111111-1111-1111-1111-111111111111' and period = '2026-11';
  if v <> 2 then raise exception 'в таблице %, ждали 2', v; end if;
  raise notice 'последовательно: ок';
end
$$;

-- 5) Права: anon и authenticated вызвать не могут, service_role может.
do $$
begin
  if has_function_privilege('anon', 'public.increment_text_usage(uuid,text)', 'execute') then
    raise exception 'anon может вызвать функцию';
  end if;
  if has_function_privilege('authenticated', 'public.increment_text_usage(uuid,text)', 'execute') then
    raise exception 'authenticated может вызвать функцию';
  end if;
  if not has_function_privilege('service_role', 'public.increment_text_usage(uuid,text)', 'execute') then
    raise exception 'service_role не может вызвать функцию';
  end if;
  raise notice 'права: ок';
end
$$;

-- 6) Чистая строка под параллельный прогон (период par-test, строки еще нет:
--    первые параллельные вызовы проверяют и гонку на insert, а не только на update).
delete from public.text_usage_counter where period = 'par-test';
