-- 20261110100000_zh6_profile.sql
-- zh6: кодовое слово психолога и выбор «звездочки в мате». ФАЙЛ НЕ ПРИМЕНЕН, только предложение.
-- Кодовое слово: генератор зовет «напишите в комментариях слово ...» только этим словом; пусто: без кодового слова.
-- mat_zvezdy: true ставить звездочку в середину матерного слова везде, false писать целиком,
-- null как раньше (выбор «Иногда, со звездочкой» в profanity значит звездочки, иначе по образцам автора).
-- Строки принадлежат владельцу профиля, читает и пишет он сам через существующие политики RLS.
-- Новых функций нет, поэтому revoke не нужен. Код (lib/generation/settings.ts) переживает базу без этих колонок.

alter table public.onboarding_profiles
  add column if not exists kodovoe_slovo text,
  add column if not exists mat_zvezdy boolean;

alter table public.onboarding_profiles
  drop constraint if exists onboarding_profiles_kodovoe_slovo_len;
alter table public.onboarding_profiles
  add constraint onboarding_profiles_kodovoe_slovo_len
  check (kodovoe_slovo is null or char_length(kodovoe_slovo) between 2 and 40);

comment on column public.onboarding_profiles.kodovoe_slovo is
  'Кодовое слово для призыва «напишите слово ... в комментариях». Пусто: генератор кодовое слово не использует.';
comment on column public.onboarding_profiles.mat_zvezdy is
  'Звездочки в мате: true со звездочкой, false целиком, null по выбору profanity и образцам автора.';
