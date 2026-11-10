-- Опрос при уходе (аналитика 2, 24.10.2026). ПРИМЕНЕНА 22.10 вручную.
-- Ответ человека на карточку «что помешало»: где спросили, коды причин, свои слова (до 300 знаков), можно ли
-- написать. Свои слова живут только здесь: в события (events) идут только коды. Пишет только сервер
-- (/api/exit-survey, service_role), читает только кабинет /admin через service_role. RLS без политик:
-- anon и authenticated не видят и не пишут ничего. Удаление пользователя удаляет и его ответы (cascade).
-- Показы и «Не сейчас» отдельно не храним: это события exit_survey_shown и exit_survey_dismiss в events.

create table if not exists public.exit_surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place text not null check (place in ('delete', 'cooling', 'cancel')),
  reasons text[] not null default '{}',          -- коды из lib/analytics/exit-survey.ts (pause, not_me, same, ...)
  other_text text check (other_text is null or char_length(other_text) <= 300),
  can_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists exit_surveys_created on public.exit_surveys (created_at desc);
create index if not exists exit_surveys_user on public.exit_surveys (user_id, created_at desc);

alter table public.exit_surveys enable row level security;
revoke all on public.exit_surveys from anon, authenticated;
