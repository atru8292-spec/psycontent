-- 27.11.2026: манера из знакомства «Как ты пишешь в блоге?» (до двух кодов: obyasnyayu, ironiya, pryamo,
-- berezhno, posvoyski; «Пока не знаю, подбери сам» = пустой массив). Читает zh13 (lib/generation/zh13/prompt.ts MANERA).
-- Только добавление nullable-колонки: старые профили не меняются (null = строки манеры в промпте нет).
-- Права: таблица уже под RLS «свой профиль»; новых функций нет.
alter table public.onboarding_profiles add column if not exists manera text[];
