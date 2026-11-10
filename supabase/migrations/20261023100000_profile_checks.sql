-- Проверка шапки Instagram (23.10.2026). ПРИМЕНЕНА 23.10 вручную (Арина, SQL Editor Supabase). Файл больше не менять: новое только новой миграцией.
-- Храним только результат: прочитанные поля шапки (текст), разбор и варианты. Скриншот не храним нигде.
-- Читает только владелец (RLS), пишет только сервер (service_role). Функций нет, revoke не нужен.
-- Без этой таблицы разбор работает, но варианты и повтор по исправленным полям не к чему привязать:
-- сервер считает каждый такой вызов отдельным материалом, «Открыть прошлую проверку» не появляется.

create table if not exists public.profile_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('screenshot', 'manual')),
  fields jsonb not null default '{}'::jsonb,   -- ник, имя, категория, описание, ссылка, кружки (текст с экрана)
  review jsonb not null default '{}'::jsonb,   -- четыре вопроса, части, находки кода
  variants jsonb,                              -- последние варианты (null, пока не пришли)
  rounds int not null default 0,               -- сколько раз сервер писал варианты (первые + «Другие варианты»)
  edits int not null default 0,                -- сколько раз разбор повторяли по исправленным полям («Поправить, что я прочитала»)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_checks_user_created on public.profile_checks (user_id, created_at desc);

alter table public.profile_checks enable row level security;

drop policy if exists profile_checks_select_own on public.profile_checks;
create policy profile_checks_select_own on public.profile_checks
  for select to authenticated using (auth.uid() = user_id);

-- вставка, правка и удаление только сервером: политик на insert/update/delete для authenticated нет
revoke insert, update, delete on public.profile_checks from anon, authenticated;
