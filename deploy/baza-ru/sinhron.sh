#!/bin/bash
# Финальная синхронизация облако -> новая база в РФ (этап 6 переезда, 11.11.2026).
# Запуск на сервере базы: bash /opt/supabase/migrate/sinhron.sh
# Нужны: /opt/supabase/migrate/cloud.dockerenv (PGHOST/PGUSER/PGPASSWORD облака, права 600), cmp.sql и cmp_cloud.txt
# из этапа 3 (эталон схемы облака), repo/20261110100000_zh6_profile.sql.
# Что делает: проверки -> копия новой базы -> свежие данные из облака -> одной транзакцией очистка и заливка ->
# миграция zh6 -> имя для писем -> сверка. Любая ошибка останавливает скрипт; транзакция при ошибке откатывается.
# Секретов и персональных данных в вывод не печатает: только имена таблиц и числа.
set -euo pipefail
cd /opt/supabase/migrate
TS=$(date +%Y%m%d-%H%M%S)
CQ() { docker exec -i --env-file /opt/supabase/migrate/cloud.dockerenv supabase-db psql -X -v ON_ERROR_STOP=1 "$@"; }
LQ() { docker exec -i supabase-db psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1 "$@"; }
# сверку схемы читаем от postgres, как в облаке: у supabase_admin схема auth в пути поиска, и политики
# выводятся как uid() вместо auth.uid(), это ложное отличие (репетиция 11.11)
LQP() { docker exec -i supabase-db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 "$@"; }
step() { echo; echo "== $*"; }

step "1. Проверки облака"
CQ -Atc "select 1" >/dev/null && echo "связь с облаком есть"
OBJ=$(CQ -Atc "select count(*) from storage.objects")
[ "$OBJ" = "0" ] || { echo "СТОП: в облачном хранилище $OBJ файлов, их надо переносить отдельно"; exit 1; }
echo "файлов в облачном хранилище: 0"
CQ -At -q < cmp.sql | grep -v "^rows " > /tmp/sinhron-cloud-now.txt
if ! diff -q <(grep -v "^rows " cmp_cloud.txt) /tmp/sinhron-cloud-now.txt >/dev/null; then
  echo "СТОП: схема облака изменилась со времени переноса (этап 3). Что отличается:"
  diff <(grep -v "^rows " cmp_cloud.txt) /tmp/sinhron-cloud-now.txt | grep -E "^[<>]" | cut -d'|' -f1 | head -30
  exit 1
fi
echo "схема облака та же, что при переносе"

step "2. Копия новой базы перед синхронизацией"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -f /tmp/pered-sinhron.dump
docker cp supabase-db:/tmp/pered-sinhron.dump "pered-sinhron-$TS.dump" >/dev/null
docker exec supabase-db rm -f /tmp/pered-sinhron.dump
chmod 600 "pered-sinhron-$TS.dump"
echo "копия: /opt/supabase/migrate/pered-sinhron-$TS.dump ($(du -h pered-sinhron-$TS.dump | cut -f1))"

step "3. Свежие данные из облака"
E="docker exec --env-file /opt/supabase/migrate/cloud.dockerenv supabase-db"
$E pg_dump --data-only -n public -n supabase_migrations -f /tmp/s_public.sql
$E pg_dump --data-only -t auth.users -t auth.identities -f /tmp/s_auth.sql
$E pg_dump --data-only -t storage.buckets -f /tmp/s_storage.sql
echo "снято"

step "4. Очистка и заливка одной транзакцией"
TABLES=$(LQ -Atc "select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) from pg_tables where schemaname = 'public'")
docker exec supabase-db sh -c "{
  echo 'BEGIN;';
  echo 'SET session_replication_role = replica;';
  echo 'TRUNCATE auth.users, storage.buckets, supabase_migrations.schema_migrations, $TABLES CASCADE;';
  cat /tmp/s_auth.sql /tmp/s_storage.sql /tmp/s_public.sql;
  echo 'COMMIT;';
} > /tmp/s_all.sql"
LQ -q -f /tmp/s_all.sql > /tmp/sinhron-load.log 2>&1 || { echo "СТОП: заливка не прошла, транзакция откачена, база как была"; grep -E "ERROR" /tmp/sinhron-load.log | cut -c1-160 | head -5; exit 1; }
docker exec supabase-db rm -f /tmp/s_public.sql /tmp/s_auth.sql /tmp/s_storage.sql /tmp/s_all.sql
rm -f /tmp/sinhron-load.log
echo "данные залиты"

step "5. Миграция zh6_profile (только новая база)"
docker cp repo/20261110100000_zh6_profile.sql supabase-db:/tmp/zh6.sql >/dev/null
docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -1 -f /tmp/zh6.sql
docker exec supabase-db rm -f /tmp/zh6.sql
LQ -q -c "insert into supabase_migrations.schema_migrations(version, name) values ('20261110100000', 'zh6_profile') on conflict (version) do nothing"
LQ -Atc "select 'колонки zh6: ' || string_agg(column_name, ', ' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'onboarding_profiles' and column_name in ('kodovoe_slovo', 'mat_zvezdy')"

step "5б. Защита имени в письмах (триггер psycont_imya_guard, только новая база)"
docker cp repo/20261111100000_auth_imya_guard.sql supabase-db:/tmp/guard.sql >/dev/null
docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -1 -f /tmp/guard.sql 2>&1 | grep -v NOTICE || true
docker exec supabase-db rm -f /tmp/guard.sql
LQ -q -c "insert into supabase_migrations.schema_migrations(version, name) values ('20261111100000', 'auth_imya_guard') on conflict (version) do nothing"
LQ -Atc "select 'триггер: ' || count(*) from pg_trigger where tgname = 'psycont_imya_guard'"

step "6. Имя для писем старым пользователям (user_metadata.imya из профиля)"
LQ -Atc "with p as (
    select user_id, left(regexp_replace(split_part(btrim(full_name), ' ', 1), '[<>{}\"]', '', 'g'), 40) as imya
      from public.onboarding_profiles where coalesce(btrim(full_name), '') <> '')
  , u as (
    update auth.users a set raw_user_meta_data = coalesce(a.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('imya', p.imya)
      from p where p.user_id = a.id and p.imya <> '' and coalesce(a.raw_user_meta_data ->> 'imya', '') = ''
    returning 1)
  select 'дописано имя: ' || count(*) || ' из ' || (select count(*) from auth.users) || ' пользователей' from u"

step "7. Сверка строк облако / новая база"
CQ -At -q < cmp.sql | grep "^rows " | sed 's/^rows //' > /tmp/sinhron-rows-cloud.txt
LQP -At -q < cmp.sql | grep "^rows " | sed 's/^rows //' > /tmp/sinhron-rows-new.txt
join -t'|' /tmp/sinhron-rows-cloud.txt /tmp/sinhron-rows-new.txt | awk -F'|' '{ ok = ($2 == $3) ? "да" : "НЕТ"; if ($1 == "supabase_migrations.schema_migrations") ok = ($3 == $2 + 2) ? "да (+zh6, +защита имени)" : "НЕТ"; printf "%-45s %6s %6s  %s\n", $1, $2, $3, ok }'
BAD=$(join -t'|' /tmp/sinhron-rows-cloud.txt /tmp/sinhron-rows-new.txt | awk -F'|' '$1 != "supabase_migrations.schema_migrations" && $2 != $3' | wc -l)

step "8. Сверка схемы (ожидаемые отличия: колонки zh6, защита имени, служебные таблицы iceberg)"
LQP -At -q < cmp.sql | grep -v "^rows " > /tmp/sinhron-new-now.txt
DIFF=$(diff /tmp/sinhron-cloud-now.txt /tmp/sinhron-new-now.txt | grep -E "^[<>]" | grep -vE "onboarding_profiles\.(kodovoe_slovo|mat_zvezdy)|iceberg_(namespaces|tables)|psycont_imya_guard" || true)
if [ -n "$DIFF" ]; then echo "НЕОЖИДАННЫЕ отличия:"; echo "$DIFF" | cut -d'|' -f1 | head -20; else echo "других отличий нет"; fi
rm -f /tmp/sinhron-*.txt

echo
if [ "$BAD" = "0" ] && [ -z "$DIFF" ]; then echo "ГОТОВО: новая база совпадает с облаком ($TS)"; else echo "ВНИМАНИЕ: есть расхождения, переключаться нельзя"; exit 2; fi
