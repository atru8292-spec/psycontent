-- zh13 (19.11.2026): проверка качества каждого текста генератора zh13 кодом, без модели. Строка на текст рядом с
-- generated_posts (тот же id), пишет только сервер (service_role), читает только кабинет /admin/kachestvo.
-- Код: lib/generation/zh13/kachestvo-db.ts. Без этой миграции генерация работает, проверка молча не пишется.

create table if not exists public.zh13_kachestvo (
  post_id uuid primary key references public.generated_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  format_kod text not null,              -- код формата zh13 (mysl, sessiya, k_priznaki...)
  vid text not null,                     -- reels | carousel | post
  rezhim text not null,                  -- tema (тема анкеты) | mysl (своя мысль)
  podpis_nachalo text,                   -- первые 2 слова подписи, строчными
  pervye_slova text,                     -- первые 2 слова текста
  dolya_podpisi_vse numeric,             -- доля того же начала подписи за 7 дней по всем, считая этот текст
  dolya_podpisi_avtor numeric,           -- то же у этого психолога
  dolya_nachala_vse numeric,             -- доля тех же первых слов текста за 7 дней по всем
  dolya_nachala_avtor numeric,
  opora text,                            -- опора подхода этого текста
  problemy text[] not null default '{}', -- коды проблем (lib/generation/zh13/proverka.ts PROBLEMY)
  detali jsonb not null default '{}',    -- что именно нашлось (мораль, род, куски копии)
  ritm jsonb,                            -- профиль ритма (мера zh12)
  blizost numeric,                       -- отклонение ритма от живых своего формата, меньше = ближе
  deystviya jsonb not null default '{}'  -- {copy, copy_podpis, format, zanovo, edit}: сколько раз
);

create index if not exists zh13_kachestvo_created_idx on public.zh13_kachestvo (created_at desc);
create index if not exists zh13_kachestvo_user_idx on public.zh13_kachestvo (user_id, created_at desc);

-- день, когда ушло письмо-тревога (не чаще раза в день)
create table if not exists public.zh13_trevogi (
  den date primary key,
  sent_at timestamptz not null default now(),
  chto text[] not null default '{}'
);

-- только сервер: RLS включен без политик, права у anon и authenticated сняты
alter table public.zh13_kachestvo enable row level security;
alter table public.zh13_trevogi enable row level security;
revoke all on table public.zh13_kachestvo from anon, authenticated;
revoke all on table public.zh13_trevogi from anon, authenticated;

comment on table public.zh13_kachestvo is 'zh13: проверка качества текста кодом и действия психолога с ним. Пишет только сервер.';

notify pgrst, 'reload schema';
