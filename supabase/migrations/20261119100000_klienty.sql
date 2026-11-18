-- Анкета 2 (19.11.2026): с чем работает психолог и кто к нему приходит.
-- Темы по-прежнему в niches (массив, все отмеченные темы по кругу между группами), первая в one_niche,
-- фразы клиентов в client_pain_phrases (через перенос строки). Новое только это поле:
-- {"groups": ["trevoga","otnosheniya"], "age": ["25-45"], "gender": "Все", "format": ["Индивидуально"]}
-- groups: trevoga, samoocenka, otnosheniya, travma, roditeli, deti, rabota, telo (lib/anketa/dannye.json).
-- Старые строки не меняются: klienty у них null, код читает это как «групп нет» и работает по niches/one_niche.

alter table public.onboarding_profiles
  add column if not exists klienty jsonb;

comment on column public.onboarding_profiles.klienty is
  'Анкета 2: группы (groups), возраст (age), пол (gender), формат (format). Значения в lib/anketa/dannye.json.';

-- PostgREST видит новую колонку сразу, без перезапуска
notify pgrst, 'reload schema';
