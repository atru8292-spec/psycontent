-- ─────────────────────────────────────────────────────────────────────────
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да».
--
-- Зачем: функции SECURITY DEFINER в схеме public видны через /rest/v1/rpc.
-- consume_energy(p_user_id, ...) принимает любой user_id и работает с правами
-- владельца (мимо RLS), то есть любой вошедший (и даже anon с публичным ключом)
-- мог списать энергию у чужого человека. Закрываем вызов всем, кроме сервера.
--
-- Сервер зовет consume_energy только через service_role (lib/energy.ts,
-- commitConsume, клиент admin() с SUPABASE_SERVICE_ROLE_KEY), его это не задевает.
--
-- Почему revoke и у PUBLIC тоже: по умолчанию Postgres выдает EXECUTE на новые
-- функции псевдороли PUBLIC, а Supabase дополнительно выдает его anon,
-- authenticated и service_role через default privileges. Если снять только у
-- anon, право останется через PUBLIC.
--
-- Триггерные функции (handle_new_user на auth.users, rls_auto_enable как
-- event trigger): по документации Postgres (CREATE TRIGGER, CREATE EVENT
-- TRIGGER) право EXECUTE на функцию нужно тому, кто СОЗДАЕТ триггер. При
-- срабатывании триггера право EXECUTE у роли, сделавшей insert, не
-- проверяется: функция вызывается механизмом триггеров, а SECURITY DEFINER
-- исполняет ее с правами владельца. Поэтому регистрация (insert в auth.users
-- от supabase_auth_admin) продолжит заводить тариф и кошелек. Владелец функции
-- (postgres) сохраняет все права как владелец, пересоздать триггер он сможет.
-- Напрямую через RPC такие функции и сейчас не вызываются (Postgres отвечает
-- «trigger functions can only be called as triggers»), revoke здесь гигиена и
-- чистит предупреждение Security Advisor. Проверено по памяти текста
-- документации, не по живой базе: после применения обязательно сделать тестовую
-- регистрацию (см. ниже, пункт 3).
--
-- rls_auto_enable в миграциях репозитория нет (создана в базе через панель
-- Supabase), точная сигнатура неизвестна, поэтому для нее блок DO ищет все
-- перегрузки по имени в pg_proc и ничего не делает, если функции нет.
--
-- ПЕРЕД ПРИМЕНЕНИЕМ (только чтение) посмотреть все SECURITY DEFINER в public,
-- вдруг есть еще что-то, чего нет в миграциях:
--   select p.oid::regprocedure as fn, pg_get_userbyid(p.proowner) as owner
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef;
--
-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ:
--   1) Права (ожидается: anon false, authenticated false, service_role true):
--      select f, has_function_privilege('anon', f, 'execute') as anon,
--                has_function_privilege('authenticated', f, 'execute') as authed,
--                has_function_privilege('service_role', f, 'execute') as service
--        from (values
--          ('public.consume_energy(uuid,integer,text,text)'::regprocedure),
--          ('public.handle_new_user()'::regprocedure)
--        ) v(f);
--      или
--      select routine_name, grantee, privilege_type
--        from information_schema.routine_privileges
--       where routine_schema = 'public'
--         and routine_name in ('consume_energy','handle_new_user','rls_auto_enable')
--       order by 1, 2;
--      (в списке не должно быть PUBLIC, anon, authenticated)
--   2) Снаружи: POST /rest/v1/rpc/consume_energy с anon-ключом должен вернуть
--      ошибку 42501 permission denied (или 404, если PostgREST скрыл функцию).
--   3) Регистрация: завести тестовый аккаунт, проверить, что у него появились
--      строки в user_subscription и energy_wallet.
--   4) Списание: на тарифе с энергией сделать платную операцию (картинка или
--      анализ), баланс уменьшился, в energy_transactions новая строка.
--
-- ОТКАТ (если что-то сломалось):
--   grant execute on function public.consume_energy(uuid, integer, text, text) to authenticated;
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Атомарное списание энергии: только сервер.
revoke execute on function public.consume_energy(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_energy(uuid, integer, text, text)
  to service_role;

-- 2) Триггер регистрации (auth.users → тариф и кошелек).
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;

-- 3) rls_auto_enable (event trigger из панели Supabase), все перегрузки, если есть.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'rls_auto_enable'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end
$$;
