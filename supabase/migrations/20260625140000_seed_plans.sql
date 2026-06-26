-- ─────────────────────────────────────────────────────────────────────────
-- SEED ТАРИФОВ (наполнение таблицы plans).
-- ВАЖНО про имена: техническая опора — это code (free/start/practice/expert/test),
-- в коде везде работаем по code. Поле name — это видимое название для пользователя.
--   code free     → «Старт»   (бесплатный, 0 ₽)
--   code start    → «Блог»    (990 ₽)
--   code practice → «Практика»(2490 ₽, популярный)
--   code expert   → «Студия»  (4990 ₽)
--   code test     → «Тест»    (служебный, не на витрине)
--
-- Цены (price, ₽) — ФИНАЛЬНЫЕ.
-- Числа energy_per_month и fair_use_text_cap — ЧЕРНОВЫЕ ОРИЕНТИРЫ,
-- калибруем на шаге перехода на OpenAI по реальной себестоимости.
-- Идемпотентно: повторный запуск обновляет значения, не задваивает.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.plans
  (code, name, price, text_unlimited, energy_per_month, deep_analysis, is_unlimited, fair_use_text_cap)
values
  ('free',     'Старт',    0,    false, 0,    false, false, 10),
  ('start',    'Блог',     990,  true,  100,  false, false, 300),
  ('practice', 'Практика', 2490, true,  400,  true,  false, 300),
  ('expert',   'Студия',   4990, true,  1000, true,  false, 300),
  ('test',     'Тест',     0,    true,  0,    true,  true,  null)
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  text_unlimited = excluded.text_unlimited,
  energy_per_month = excluded.energy_per_month,
  deep_analysis = excluded.deep_analysis,
  is_unlimited = excluded.is_unlimited,
  fair_use_text_cap = excluded.fair_use_text_cap;
