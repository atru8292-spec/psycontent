-- Один вызов для pgbench (scripts/sql/test-increment-text-usage.sh). Не для боевой базы.
select public.increment_text_usage('11111111-1111-1111-1111-111111111111', 'par-test');
