-- fix/tarify (12.11, решение Арины): тарифы в базе сводятся с витриной lib/pricing.ts.
-- Технические коды не меняются (на них завязаны подписки, lib/pricing.ts dbCodes и аналитика), меняются только
-- видимое имя, цена и предел материалов (fair_use_text_cap). expert («Студия») на витрине показывается как
-- «Каждый день», поэтому он такой же. Энергия (разбор конкурента, расшифровка, картинки) не трогается.
-- Пробный «без срока» сделан в коде (lib/energy.ts usedForLimit: у free счетчик за все месяцы), схема та же.
-- На 12.11 на кодах start, practice, expert нет ни одного человека (агрегатный запрос перед миграцией).
update public.plans set name = 'Пробный',        price = 0,    fair_use_text_cap = 10  where code = 'free';
update public.plans set name = 'Спокойный ритм', price = 1290, fair_use_text_cap = 50  where code = 'start';
update public.plans set name = 'Каждый день',    price = 2490, fair_use_text_cap = 150 where code = 'practice';
update public.plans set name = 'Каждый день',    price = 2490, fair_use_text_cap = 150 where code = 'expert';
