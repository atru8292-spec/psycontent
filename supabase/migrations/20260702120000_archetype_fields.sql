-- ЭТАП 5: архетип автора (тест-распаковка). Два новых поля в onboarding_profiles.
--   archetype_scores jsonb — результат теста: { selection: {primary, secondary, flexible}, top3, percents, ranked }
--   archetype_primary text — денормализованный ведущий архетип (ключ), быстрый читать в промпте генерации
--
-- Безопасность: RLS таблицы onboarding_profiles уже покрывает новые колонки
-- (владелец читает и пишет только свою строку). Генерация читает через service_role.
-- Отдельные политики не нужны. Данные необязательные (тест можно не пройти) -> NULL допустим.

ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS archetype_scores jsonb,
  ADD COLUMN IF NOT EXISTS archetype_primary text;

COMMENT ON COLUMN onboarding_profiles.archetype_scores IS 'Результат теста-распаковки: selection (primary/secondary/flexible), top3, percents. Пишет тест-распаковка, читает генерация.';
COMMENT ON COLUMN onboarding_profiles.archetype_primary IS 'Денормализованный ведущий архетип (ключ вроде sage/jester) для быстрого чтения в промпте.';
