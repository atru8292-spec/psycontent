-- ─────────────────────────────────────────────────────────────────────────
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да».
--
-- Зачем: lib/energy.ts incrementText раньше читал счетчик материалов и писал
-- count + 1 вторым запросом. Два списания одновременно (окно в старых роутах
-- 20-60 с) читали одно и то же число, и одно списание терялось: лимит
-- материалов можно было обойти параллельными запросами.
-- Теперь +1 делается одной командой insert ... on conflict do update:
-- Postgres берет блокировку строки (user_id, period), второй параллельный
-- вызов ждет первого и прибавляет к уже обновленному значению.
--
-- Код выкатывается и до этой миграции: если функции нет (PGRST202 / 42883),
-- incrementText идет старым путем (чтение и upsert). После применения старый
-- путь не используется.
--
-- Права: SECURITY DEFINER принимает любой user_id и работает мимо RLS, поэтому
-- вызывать может только сервер (service_role), как consume_energy в
-- 20261004110000_revoke_rpc.sql. revoke у PUBLIC обязателен: по умолчанию
-- Postgres дает EXECUTE псевдороли PUBLIC, Supabase еще anon и authenticated.
--
-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ (ожидается anon false, authed false, service true):
--   select has_function_privilege('anon', 'public.increment_text_usage(uuid,text)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.increment_text_usage(uuid,text)', 'execute') as authed,
--          has_function_privilege('service_role', 'public.increment_text_usage(uuid,text)', 'execute') as service;
-- Снаружи: POST /rest/v1/rpc/increment_text_usage с anon-ключом дает 42501 или 404.
-- Проверка гонки на отдельной временной базе: scripts/sql/test-increment-text-usage.sql.
--
-- ОТКАТ: drop function if exists public.increment_text_usage(uuid, text);
--   (код сам вернется на старый путь)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.increment_text_usage(p_user_id uuid, p_period text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.text_usage_counter (user_id, period, count)
  values (p_user_id, p_period, 1)
  on conflict (user_id, period)
  do update set count = text_usage_counter.count + 1
  returning count;
$$;

revoke execute on function public.increment_text_usage(uuid, text)
  from public, anon, authenticated;
grant execute on function public.increment_text_usage(uuid, text)
  to service_role;
