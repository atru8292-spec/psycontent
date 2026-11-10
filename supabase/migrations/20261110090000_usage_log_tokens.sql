-- Токены и модель в журнале расходов usage_log (10.11.2026, переезд базы, ветка feat/baza-ru).
-- В облаке эти 4 колонки добавлены руками без миграции; файл нужен, чтобы базу можно было поднять с нуля
-- из репозитория. Пишет только сервер: lib/energy.ts logAiUsage (точные токены из ответа OpenAI).
-- Идемпотентно: на базе, где колонки уже есть (облако, новая база в РФ), ничего не меняет.
-- Функций нет, revoke не нужен; права на таблицу прежние (usage_log читает и пишет только service_role).

alter table public.usage_log
  add column if not exists model text,
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer,
  add column if not exists cached_tokens integer;
