-- Голос: мат «как в жизни» и эмоциональность текстов (экран «Покажи, как ты говоришь», блок «Как ты звучишь»).
-- Ничего не удаляет: к старым значениям мата добавляется 'free', новая колонка intensity пустая у всех.
alter table public.onboarding_profiles
  drop constraint if exists onboarding_profiles_profanity_check;
alter table public.onboarding_profiles
  add constraint onboarding_profiles_profanity_check check (profanity in ('no', 'light', 'free'));

alter table public.onboarding_profiles
  add column if not exists intensity text;
alter table public.onboarding_profiles
  drop constraint if exists onboarding_profiles_intensity_check;
alter table public.onboarding_profiles
  add constraint onboarding_profiles_intensity_check check (intensity in ('calm', 'live', 'hot'));

comment on column public.onboarding_profiles.profanity is 'Мат в текстах: no | light (точечно, со звездочкой) | free (как в жизни).';
comment on column public.onboarding_profiles.intensity is 'Эмоции в текстах: calm (спокойно) | live (живо, как в разговоре) | hot (на эмоциях). null: по слепку.';
