-- Узор на фоне карусели: none, lenty, linii, zmeyki, kletka, dymka. Идет через все слайды.
-- В карусели свой, в профиле последний выбранный (переходит в новые карусели).
-- Список узоров будет расти, поэтому без check: неизвестное значение код читает как none.
alter table public.carousel_designs
  add column if not exists decor text not null default 'none';
alter table public.carousel_designs
  drop constraint if exists carousel_designs_decor_check;

alter table public.onboarding_profiles
  add column if not exists carousel_decor text;
