-- ─────────────────────────────────────────────────────────────────────────
-- ФУНДАМЕНТ ЭНЕРГИИ И ТАРИФОВ (новые таблицы) — применяется на прод.
-- Принцип безопасности (важно для денег): пользователь может ТОЛЬКО ЧИТАТЬ свой
-- баланс/историю/тариф. Писать энергию (начислять/списывать) может только сервер
-- (service_role, обходит RLS). Поэтому у энергетических таблиц НЕТ политик на
-- запись для пользователя — никто не сможет сам себе начислить энергию.
-- user_id хранится как обычный uuid (FK на auth.users — как у остальных таблиц),
-- бизнес-логика на специфику Supabase не завязана (переносимость в РФ-Postgres).
-- ─────────────────────────────────────────────────────────────────────────

-- ── plans — тарифы (Free / Старт / Практика / Эксперт / Тест) ──
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- 'free' | 'start' | 'practice' | 'expert' | 'test'
  name text not null,
  price integer not null default 0,          -- рубли в месяц
  text_unlimited boolean not null default false,
  energy_per_month integer not null default 0,
  deep_analysis boolean not null default false,
  is_unlimited boolean not null default false, -- тариф «Тест»: не списываем, пишем would_charge
  fair_use_text_cap integer,                 -- скрытый предел текста (NULL = без предела)
  created_at timestamptz not null default now()
);

-- ── user_subscription — какой тариф у пользователя и на какой период ──
create table if not exists public.user_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  period_start timestamptz not null default now(),
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)                           -- одна активная подписка на пользователя
);

-- ── energy_wallet — кошелёк энергии (одна строка на пользователя) ──
create table if not exists public.energy_wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  monthly_allowance integer not null default 0,
  next_refill timestamptz,
  total_spent integer not null default 0,
  total_purchased integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ── energy_transactions — история начислений/списаний энергии ──
create table if not exists public.energy_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,                   -- + начисление, − списание
  reason text,                               -- человекочитаемая причина
  operation text,                            -- тип операции (картинка/анализ/...)
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_energy_transactions_user_created
  on public.energy_transactions (user_id, created_at desc);

-- ── usage_log — журнал реальной себестоимости КАЖДОЙ операции (пишется всегда) ──
create table if not exists public.usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  real_cost_usd numeric(12,6),
  real_cost_rub numeric(12,4),
  energy_charged integer not null default 0, -- сколько энергии реально списали
  would_charge integer not null default 0,   -- сколько списали бы (для тарифа «Тест»)
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_log_user_created
  on public.usage_log (user_id, created_at desc);

-- ── text_usage_counter — скрытый счётчик текста (fair-use), по месяцам ──
create table if not exists public.text_usage_counter (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,                      -- 'YYYY-MM'
  count integer not null default 0,
  primary key (user_id, period)
);

-- ── RLS ──
alter table public.plans               enable row level security;
alter table public.user_subscription   enable row level security;
alter table public.energy_wallet       enable row level security;
alter table public.energy_transactions enable row level security;
alter table public.usage_log           enable row level security;
alter table public.text_usage_counter  enable row level security;

-- plans — тарифы видны всем (это публичная витрина цен). Запись — только сервер.
drop policy if exists "Anyone can read plans" on public.plans;
create policy "Anyone can read plans" on public.plans
  for select using (true);

-- user_subscription — пользователь читает только свою подписку. Запись — сервер.
drop policy if exists "Users can read own subscription" on public.user_subscription;
create policy "Users can read own subscription" on public.user_subscription
  for select using (auth.uid() = user_id);

-- energy_wallet — пользователь читает только свой кошелёк. Запись — только сервер.
drop policy if exists "Users can read own wallet" on public.energy_wallet;
create policy "Users can read own wallet" on public.energy_wallet
  for select using (auth.uid() = user_id);

-- energy_transactions — пользователь читает только свою историю. Запись — сервер.
drop policy if exists "Users can read own transactions" on public.energy_transactions;
create policy "Users can read own transactions" on public.energy_transactions
  for select using (auth.uid() = user_id);

-- usage_log и text_usage_counter — служебные (себестоимость, скрытый счётчик).
-- Пользователю не нужны: RLS включён, политик для пользователя НЕТ → доступ
-- только у сервера (service_role). Так внутренние данные о затратах не утекают.
