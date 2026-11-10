-- Автовключение RLS на новых таблицах public (10.11.2026, переезд базы, ветка feat/baza-ru).
-- В облаке функция rls_auto_enable и event trigger ensure_rls созданы через панель Supabase (настройка
-- «включать RLS на новых таблицах»), миграции не было (см. 20261004110000_revoke_rpc.sql, там только revoke).
-- Файл нужен, чтобы база с нуля из репозитория была так же защищена: любая новая таблица в public сразу
-- с включенным RLS, и без политик ее не видят ни anon, ни authenticated.
-- Тело функции скопировано из облака дословно (pg_get_functiondef). Идемпотентно: create or replace с тем же
-- телом ничего не меняет, event trigger создается, только если его еще нет. Запускать от роли postgres:
-- supautils не дает суперпользователю вешать event trigger на функцию обычной роли.
-- Права как в облаке и как требует CLAUDE.md для SECURITY DEFINER: EXECUTE только у service_role.

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$

;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$$;
