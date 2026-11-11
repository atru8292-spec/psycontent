-- Число строк в каждой таблице схем public, auth, storage, supabase_migrations (для описи бэкапа и проверки восстановления).
create temp table c(k text, n bigint);
do $$ declare r record; n bigint; begin
  for r in select schemaname s, tablename t from pg_tables where schemaname in ('public', 'auth', 'storage', 'supabase_migrations') loop
    execute format('select count(*) from %I.%I', r.s, r.t) into n;
    insert into c values (r.s || '.' || r.t, n);
  end loop; end $$;
select k || '|' || n from c order by k;
