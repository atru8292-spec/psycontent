-- Анкета 2 (19.11.2026): кто приходит к психологу. НЕ ПРИМЕНЕНА: применяет Арина после проверки экранов.
-- Темы по-прежнему в niches (массив), первая тема в one_niche, фразы клиентов в client_pain_phrases
-- (через перенос строки), поэтому прод-генератор работает без правок. Новое только это поле:
-- {"groups": ["a","v"], "age": ["Дети","25-45"], "gender": "Все", "format": ["Индивидуально","Семьи"]}
-- groups: a взрослый про себя, b отношения, v семья и дети, g работа и деньги, d горе и утрата, n нейропсихология.

alter table public.onboarding_profiles
  add column if not exists klienty jsonb;

comment on column public.onboarding_profiles.klienty is
  'Анкета 2: кто приходит. groups (a,b,v,g,d,n), age, gender, format. Значения чипов в lib/anketa/dannye.json.';
