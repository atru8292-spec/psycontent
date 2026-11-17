-- Оплата через ЮKassa (17.11, ветка feat/oplata, роль 8 задачи запуска). НЕ ПРИМЕНЕНА: применять только после «да» Арины
-- и свежей копии базы. Порядок с кодом: миграцию можно применить раньше выкатки кода (новые колонки с безопасными
-- значениями по умолчанию, старый код их не читает).
--
-- Принцип денег (CLAUDE.md): человек только ЧИТАЕТ свое (платежи, способ оплаты, согласия, возвраты, подписку).
-- Пишет только сервер (service_role). Политик на insert/update/delete для anon и authenticated нет.
-- Платежи и возвраты при удалении аккаунта не удаляются (учет дохода самозанятой), а теряют связь с человеком:
-- user_id on delete set null, почту для чека код удаления стирает (lib/account-delete.ts).

-- ── подписка: состояние окна оплаты и автопродления ──
alter table public.user_subscription
  add column if not exists status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  add column if not exists auto_renew boolean not null default false,
  add column if not exists payment_method_id uuid null,
  add column if not exists next_charge_at timestamptz null,
  add column if not exists retry_count integer not null default 0,
  add column if not exists canceled_at timestamptz null,
  add column if not exists reminder_sent_for timestamptz null,
  add column if not exists billing_anchor_day smallint null check (billing_anchor_day is null or billing_anchor_day between 1 and 31),
  add column if not exists next_plan_code text null check (next_plan_code is null or next_plan_code in ('start', 'practice'));
comment on column public.user_subscription.next_plan_code is 'Смена тарифа (решение Арины 17.11): этот тариф начнется со следующего списания, без доплаты; согласие на новую сумму в autopay_consents';
comment on column public.user_subscription.billing_anchor_day is 'День месяца первой оплаты (по Москве): окно продлевается на этот день, в коротком месяце на последний';
comment on column public.user_subscription.status is 'trial: пробный; active: оплачено окно [period_start, period_end); past_due: продление не прошло, идут повторы; canceled: автопродление выключено или возврат; expired: окно кончилось, тариф снова free';
comment on column public.user_subscription.next_charge_at is 'Когда списать следующий раз (конец окна или время повтора). null: автопродления нет';
comment on column public.user_subscription.reminder_sent_for is 'Для какого next_charge_at уже ушло письмо «за 3 дня»';

-- ── сохраненные способы оплаты (карта, СБП) ──
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  yk_method_id text not null unique check (length(yk_method_id) <= 100),
  type text not null check (length(type) <= 40),            -- bank_card, sbp, yoo_money, sberbank, tinkoff_bank
  title text not null check (length(title) <= 80),          -- «Карта Visa ****1234», «СБП, Сбербанк»
  card_last4 text null check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz null                               -- «Удалить карту»: больше никогда не списываем
);
create index if not exists idx_payment_methods_user on public.payment_methods (user_id);
alter table public.user_subscription
  drop constraint if exists user_subscription_payment_method_fk,
  add constraint user_subscription_payment_method_fk foreign key (payment_method_id) references public.payment_methods(id) on delete set null;

-- ── согласия на автопродление (доказательство: кто, когда, какой текст, с какого адреса) ──
-- после удаления аккаунта согласие остается без связи с человеком (user_id null) и без почты 3 года, потом таймер
-- оплаты его удаляет (решение Арины 17.11, /privacy раздел 8): доказательство, что списания были с согласия
create table if not exists public.autopay_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  plan_code text not null,
  amount numeric(10, 2) not null,
  consent_text text not null check (length(consent_text) <= 2000),
  offer_version text not null,
  ip text null check (ip is null or length(ip) <= 64),
  payment_id uuid null,
  created_at timestamptz not null default now()
);
create index if not exists idx_autopay_consents_user on public.autopay_consents (user_id, created_at desc);
create index if not exists idx_autopay_consents_orphan on public.autopay_consents (created_at) where user_id is null;

-- ── платежи ──
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  email text null,                                          -- куда отправить ссылку на чек; стирается при удалении аккаунта
  yk_payment_id text null unique,
  kind text not null check (kind in ('first', 'renewal')),
  plan_code text not null,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
  save_requested boolean not null default false,            -- человек отметил согласие на автопродление
  method_type text null,                                    -- sbp, bank_card... из ответа ЮKassa
  payment_method_id uuid null references public.payment_methods(id) on delete set null,
  idempotence_key text not null unique,
  attempt integer not null default 1,                       -- номер попытки продления
  period_start timestamptz null,                            -- какое окно оплачено (после успеха)
  period_end timestamptz null,
  cancellation_reason text null,                            -- код ЮKassa: insufficient_funds, expired_on_confirmation...
  receipt_status text not null default 'none' check (receipt_status in ('none', 'need', 'done', 'annul_need', 'annulled')),
  receipt_url text null check (receipt_url is null or receipt_url ~ '^https://'),
  paid_at timestamptz null,
  confirmation_url text null check (confirmation_url is null or confirmation_url ~ '^https://'),  -- свежий неоплаченный платеж отдаем снова
  note text null check (note is null or length(note) <= 200),  -- пометки: via:sbp, anchor:17, nosave, double, refund_due, check
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payments_user on public.payments (user_id, created_at desc);
create index if not exists idx_payments_status on public.payments (status, created_at);

-- ── возвраты ──
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  user_id uuid null references auth.users(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  days_left integer not null,
  days_total integer not null,
  yk_refund_id text null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'canceled')),
  idempotence_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── уведомления ЮKassa: каждое событие один раз ──
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,                           -- событие:id объекта:статус
  event text not null,
  object_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  result text null check (result is null or length(result) <= 60)
);

-- ── очередь писем об оплате: ночью (вне 10:00-20:00 по Москве) и после неудачной отправки. Почты нет, она берется
-- в момент отправки; в data только тариф, суммы и даты письма. Отправленные старше 30 дней можно чистить ──
create table if not exists public.pay_mail_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{3,30}$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2048),
  send_after timestamptz not null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pay_mail_queue_due on public.pay_mail_queue (send_after) where sent_at is null;

-- ── права: человек читает только свое, пишет только сервер ──
alter table public.payment_methods  enable row level security;
alter table public.autopay_consents enable row level security;
alter table public.payments         enable row level security;
alter table public.refunds          enable row level security;
alter table public.payment_events   enable row level security;
alter table public.pay_mail_queue   enable row level security;

drop policy if exists "own payment methods" on public.payment_methods;
create policy "own payment methods" on public.payment_methods for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own consents" on public.autopay_consents;
create policy "own consents" on public.autopay_consents for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own refunds" on public.refunds;
create policy "own refunds" on public.refunds for select to authenticated using (auth.uid() = user_id);
-- payment_events: политик нет, только service_role

revoke all on public.payment_methods, public.autopay_consents, public.payments, public.refunds, public.payment_events from anon;
revoke insert, update, delete, truncate on public.payment_methods, public.autopay_consents, public.payments, public.refunds, public.payment_events from authenticated;
revoke all on public.payment_events from authenticated;
revoke all on public.pay_mail_queue from anon, authenticated;
grant all on public.pay_mail_queue to service_role;
grant select on public.autopay_consents, public.payments, public.refunds to authenticated;
-- способ оплаты: человек видит свои карты без токена ЮKassa (yk_method_id только сервер, ревью 17.11)
revoke select on public.payment_methods from authenticated;  -- права по умолчанию Supabase дают всю таблицу
grant select (id, user_id, type, title, card_last4, created_at) on public.payment_methods to authenticated;
grant all on public.payment_methods, public.autopay_consents, public.payments, public.refunds, public.payment_events to service_role;

-- подписку меняет только сервер: второй замок к RLS (политики на запись и так нет)
revoke insert, update, delete, truncate on public.user_subscription from anon, authenticated;
