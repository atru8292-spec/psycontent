-- Проверка профиля Instagram: бесплатные отказы модели за сутки (23.10.2026). ПРИМЕНЕНА 23.10 вручную (Арина). Файл больше не менять: новое только новой миграцией.
-- Отказ это ответ «не похоже на профиль» или «не прочиталось»: материал не списывается, но вызов модели стоит денег,
-- поэтому таких бесплатных вызовов не больше 5 в сутки на человека (app/api/profile-check/route.ts, FREE_FAILS).
-- Раньше счетчик жил в памяти процесса и обнулялся при перезапуске. Без этой таблицы код работает как раньше (память).
-- Ничего личного: только кто, когда и код отказа. Читает и пишет только сервер (service_role), RLS без политик.

create table if not exists public.profile_check_fails (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code in ('not_profile', 'unreadable')),
  created_at timestamptz not null default now()
);

create index if not exists profile_check_fails_user_created on public.profile_check_fails (user_id, created_at desc);

alter table public.profile_check_fails enable row level security;
-- политик нет: anon и authenticated не видят и не пишут ничего, service_role обходит RLS
revoke all on public.profile_check_fails from anon, authenticated;
