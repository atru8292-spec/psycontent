#!/usr/bin/env bash
# Гонка счетчика материалов: 200 параллельных increment_text_usage, ждем count = 200.
# ТОЛЬКО на отдельной временной базе (создает и удаляет public.text_usage_counter).
#   createdb psy_tmp            # или любой пустой Postgres 14+
#   bash scripts/sql/test-increment-text-usage.sh "postgres://USER:PASS@HOST:PORT/psy_tmp"
# Запускать из корня репозитория.
set -euo pipefail
DB="${1:?адрес временной базы первым аргументом}"
case "$DB" in *supabase.co*|*supabase.com*|*gzzsrzxavteafapdntgu*) echo "Это похоже на Supabase. Нужна отдельная временная база." >&2; exit 1;; esac

psql "$DB" -v ON_ERROR_STOP=1 -q -f scripts/sql/test-increment-text-usage.sql

if command -v pgbench >/dev/null 2>&1; then
  # 20 соединений по 10 вызовов = 200 вызовов параллельно
  pgbench "$DB" -n -c 20 -j 4 -t 10 -f scripts/sql/increment-text-usage-bench.sql
else
  # без pgbench: 200 отдельных psql, по 50 одновременно
  seq 200 | xargs -P 50 -I{} psql "$DB" -qAt -c \
    "select public.increment_text_usage('11111111-1111-1111-1111-111111111111', 'par-test')" >/dev/null
fi

GOT=$(psql "$DB" -qAt -c "select count from public.text_usage_counter where user_id = '11111111-1111-1111-1111-111111111111' and period = 'par-test'")
ROWS=$(psql "$DB" -qAt -c "select count(*) from public.text_usage_counter where period = 'par-test'")
echo "count = $GOT, строк = $ROWS (ждем 200 и 1)"
[ "$GOT" = "200" ] && [ "$ROWS" = "1" ] && echo "параллельно: ок" || { echo "ПРОВАЛ" >&2; exit 1; }
