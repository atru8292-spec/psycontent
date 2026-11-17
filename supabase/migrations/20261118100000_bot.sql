-- Бот поддержки @psycont_supportbot (18.11, ветка feat/bot). НЕ ПРИМЕНЕНА: применять только после «да» Арины.
-- Порядок с кодом: миграцию можно применить раньше выкатки кода (новые таблицы, старый код их не читает).
-- Без миграции код бота не падает: вебхук отвечает 200, пересылка идет без карточки и без памяти обращений,
-- журнал сбоев молча не пишется.
--
-- Принципы:
-- * Читает и пишет только сервер (service_role). RLS включен, политик для клиента нет, у anon и authenticated
--   права отозваны (второй замок к RLS).
-- * Тексты сообщений человека и ответов в базе НЕ храним: только id сообщений Telegram (для реплая), тип и время.
--   Сами сообщения живут в чате Арины с ботом.
-- * Из Telegram храним только id и имя (first_name). Ник (username) не сохраняем (решение Арины 18.11).
-- * Метки входа хранятся только хешем (sha256), сама метка живет в ссылке 24 часа и одноразовая.
-- * Журнал сбоев без текстов и токенов: вид, код (латиница, до 60 знаков), user_id, время.
-- * Удаление аккаунта (lib/account-delete.ts, auth.admin.deleteUser): связь Telegram, метки, обращения этого аккаунта
--   и его строки журнала сбоев уходят каскадом (on delete cascade на auth.users). Обращения без аккаунта и прочие
--   чистит таймер сигналов по сроку: 12 месяцев после последнего сообщения обращения.

-- ── связь пользователя Telegram с аккаунтом PsyCont (ставится по одноразовой метке из кабинета) ──
create table if not exists public.bot_tg_links (
  tg_user_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists idx_bot_tg_links_user on public.bot_tg_links (user_id);

-- ── одноразовые метки для ссылки t.me/psycont_supportbot?start=<метка>, хранится только хеш ──
create table if not exists public.bot_link_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_link_tokens_user on public.bot_link_tokens (user_id, created_at desc);
create index if not exists idx_bot_link_tokens_exp on public.bot_link_tokens (expires_at);

-- ── обращения: одна переписка с человеком. Новое обращение открывается, если прошлое молчит дольше суток ──
create table if not exists public.bot_tickets (
  id bigint generated always as identity primary key,
  tg_chat_id bigint not null,
  tg_user_id bigint not null,
  tg_first_name text null check (tg_first_name is null or length(tg_first_name) <= 64),
  user_id uuid null references auth.users(id) on delete cascade,
  opened_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  answered_at timestamptz null              -- null: есть вопрос без ответа
);
create index if not exists idx_bot_tickets_chat on public.bot_tickets (tg_chat_id, last_message_at desc);
create index if not exists idx_bot_tickets_open on public.bot_tickets (last_message_at) where answered_at is null;
create index if not exists idx_bot_tickets_last on public.bot_tickets (last_message_at);
create index if not exists idx_bot_tickets_user on public.bot_tickets (user_id) where user_id is not null;

-- ── сообщения обращения: без текста, только id для реплая и тип ──
create table if not exists public.bot_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.bot_tickets(id) on delete cascade,
  tg_chat_id bigint not null,
  direction text not null check (direction in ('in', 'out')),
  kind text not null check (kind in ('text', 'photo', 'voice', 'document', 'audio', 'video', 'video_note', 'other')),
  tg_message_id bigint not null,            -- id сообщения в чате человека (in: его сообщение; out: копия ответа Арины)
  admin_message_id bigint null,             -- id в чате Арины (in: копия вопроса, на нее она отвечает реплаем; out: ее сообщение)
  admin_card_id bigint null,                -- in: id карточки в чате Арины (реплай на карточку тоже работает)
  admin_chat_id bigint null,                -- чат Арины, где лежат admin_message_id и admin_card_id: id сообщений уникальны
                                            -- только внутри чата, при смене TELEGRAM_ADMIN_CHAT_ID реплай не уйдет чужому
  created_at timestamptz not null default now()
);
-- повтор вебхука от Telegram с тем же сообщением не пересылается второй раз
create unique index if not exists uq_bot_messages_in on public.bot_messages (tg_chat_id, tg_message_id) where direction = 'in';
create index if not exists idx_bot_messages_admin on public.bot_messages (admin_chat_id, admin_message_id) where admin_message_id is not null;
create index if not exists idx_bot_messages_card on public.bot_messages (admin_chat_id, admin_card_id) where admin_card_id is not null;
create index if not exists idx_bot_messages_ticket on public.bot_messages (ticket_id, created_at);

-- ── журнал сбоев для сигналов, сводки и /oshibki: без текстов и токенов ──
create table if not exists public.bot_incidents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('gen', 'openai', 'pay_webhook', 'billing', 'bot', 'db')),
  code text not null check (code ~ '^[A-Za-z0-9_.:-]{1,60}$'),
  user_id uuid null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_incidents_kind on public.bot_incidents (kind, created_at desc);
create index if not exists idx_bot_incidents_at on public.bot_incidents (created_at desc);
create index if not exists idx_bot_incidents_user on public.bot_incidents (user_id, created_at desc) where user_id is not null;

-- ── антиспам срочных сигналов: один и тот же не чаще раза в 30 минут, с числом повторов ──
create table if not exists public.bot_signal_state (
  key text primary key check (key ~ '^[a-z0-9_:]{1,60}$'),
  last_sent_at timestamptz not null,
  suppressed integer not null default 0 check (suppressed >= 0),
  updated_at timestamptz not null default now()
);

-- ── права: только сервер ──
alter table public.bot_tg_links     enable row level security;
alter table public.bot_link_tokens  enable row level security;
alter table public.bot_tickets      enable row level security;
alter table public.bot_messages     enable row level security;
alter table public.bot_incidents    enable row level security;
alter table public.bot_signal_state enable row level security;
-- политик нет: anon и authenticated не видят ни строки

revoke all on public.bot_tg_links, public.bot_link_tokens, public.bot_tickets, public.bot_messages,
  public.bot_incidents, public.bot_signal_state from public, anon, authenticated;
revoke all on sequence public.bot_tickets_id_seq, public.bot_messages_id_seq, public.bot_incidents_id_seq
  from public, anon, authenticated;
grant all on public.bot_tg_links, public.bot_link_tokens, public.bot_tickets, public.bot_messages,
  public.bot_incidents, public.bot_signal_state to service_role;
grant usage, select on sequence public.bot_tickets_id_seq, public.bot_messages_id_seq, public.bot_incidents_id_seq
  to service_role;

comment on table public.bot_tickets is 'Обращения в поддержку через Telegram. Текстов нет. Срок хранения 12 месяцев после last_message_at (чистит таймер сигналов)';
comment on table public.bot_incidents is 'Журнал сбоев для сигналов Арине: только вид и код, без текстов и токенов. Хранится 60 дней';
