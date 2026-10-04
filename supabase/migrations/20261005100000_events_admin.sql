-- ─────────────────────────────────────────────────────────────────────────
-- АНАЛИТИКА И АДМИН-КАБИНЕТ (задача _знания/PROMPT-CLAUDE-CODE-analitika.md, этапы 1 и 4).
-- НЕ ПРИМЕНЕНА. Применяет другой агент после «да» Арины.
-- Нужны колонки carousel_designs.export_count, exported_at, export_method (миграция
-- 20261003100000_carousel_my_design.sql). На живой базе 04.10 они есть; без них
-- analytics_features и analytics_person упадут при вызове (plpgsql), а не при применении.
--
-- Что это:
-- 1) Таблица public.events: факты действий людей в продукте (визиты, шаги онбординга,
--    запуски «Сделать», «взяла текст», лимиты, ошибки, открытые функции).
--    Таблица НЕ хранит тексты: ни постов, ни тем, ни мыслей, ни ответов онбординга,
--    ни имен, ни ссылок, ни IP, ни user-agent. props проходят санитайзер
--    (lib/analytics/sanitize.ts): только разрешенные ключи, числа, true/false и короткие
--    коды [a-z0-9_,.:-] до 40 знаков. Размер props ограничен check'ом (< 2048 байт).
--    Пишет и читает только сервер (service_role): RLS включен, политик нет,
--    у anon и authenticated права сняты.
-- 2) Функции для кабинета /admin (analytics_*): считают воронку, людей, онбординг,
--    траты и риск ухода прямо в базе. Все SECURITY DEFINER, вызывать может только
--    service_role. Тексты постов, тем, мыслей и ответов онбординга функции не читают
--    вовсе: из generated_posts берутся только id, user_id, format, created_at,
--    published_at, group_id, pipeline_status; из voice_events только kind, data
--    (change_ratio), created_at, post_id; из onboarding_profiles только user_id,
--    full_name, created_at, completed_at и признак «слепок голоса пуст».
--
-- Определения (что такое «взяла текст», ритм, риск ухода, статусы) синхронно
-- с lib/analytics/definitions.ts. Меняешь там, меняй и здесь.
--
-- ОТКАТ (выполнить целиком):
--   drop function if exists public.analytics_person(uuid, text);
--   drop function if exists public.analytics_costs(text[], boolean, timestamptz, timestamptz, text);
--   drop function if exists public.analytics_features(text[], boolean, text);
--   drop function if exists public.analytics_make(text[], boolean, timestamptz, timestamptz);
--   drop function if exists public.analytics_onboarding(text[], boolean, timestamptz, timestamptz);
--   drop function if exists public.analytics_funnel(text[], boolean, timestamptz, timestamptz, text);
--   drop function if exists public.analytics_overview(text[], boolean, text);
--   drop function if exists public.analytics_people(text[], boolean, text);
--   drop function if exists public.analytics_churn(uuid, text);
--   drop function if exists public._analytics_milestones(text[], boolean, text);
--   drop function if exists public._analytics_materials(uuid);
--   drop function if exists public._analytics_takes(uuid);
--   drop function if exists public._analytics_users(text[], boolean);
--   drop function if exists public._analytics_tz(text);
--   drop function if exists public._analytics_uuid(text);
--   drop function if exists public._analytics_num(text);
--   drop function if exists public._analytics_fmt(text);
--   drop index if exists public.idx_usage_log_created;
--   drop index if exists public.idx_generated_posts_user_created;
--   drop index if exists public.idx_generated_posts_published;
--   drop table if exists public.events;
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Таблица событий ──
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid null references auth.users(id) on delete cascade,
  session_id text null check (session_id is null or length(session_id) <= 40),
  event text not null check (event ~ '^[a-z0-9_]{2,40}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048),
  path text null check (path is null or length(path) <= 120),
  created_at timestamptz not null default now()
);

comment on table public.events is 'События аналитики: только факты действий (что сделала, формат, миллисекунды, код ошибки). Текстов постов, тем, мыслей, ответов, имен, ссылок, IP нет. Пишет и читает только сервер.';

create index if not exists idx_events_user_created on public.events (user_id, created_at desc);
create index if not exists idx_events_event_created on public.events (event, created_at desc);
create index if not exists idx_events_created on public.events (created_at desc);

alter table public.events enable row level security;
-- политик нет намеренно: доступ только у service_role
revoke all on public.events from anon, authenticated;
-- в Supabase service_role и так получает права по default privileges, выдаем явно на случай другого хостинга
grant select, insert, delete on public.events to service_role;

-- Индексы под запросы кабинета
create index if not exists idx_usage_log_created on public.usage_log (created_at desc);
create index if not exists idx_generated_posts_user_created on public.generated_posts (user_id, created_at desc);
create index if not exists idx_generated_posts_published on public.generated_posts (user_id, published_at) where published_at is not null;

-- ── 2. Вспомогательные функции ──

-- Формат материала для кабинета: reels и любые reels_* это 'reels', остальное как есть
create or replace function public._analytics_fmt(f text)
returns text language sql immutable set search_path = public
as $$ select case when f like 'reels%' then 'reels' else f end $$;

-- Число из строки jsonb (props ms, step, change_ratio); не число, значит null, без ошибки
create or replace function public._analytics_num(v text)
returns numeric language sql immutable set search_path = public
as $$ select case when v ~ '^-?[0-9]{1,15}(\.[0-9]{1,15})?$' then v::numeric end $$;

-- uuid из строки (props post); не uuid, значит null
create or replace function public._analytics_uuid(v text)
returns uuid language sql immutable set search_path = public
as $$ select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end $$;

-- Часовой пояс: неизвестное имя не роняет кабинет, берется Asia/Barnaul
create or replace function public._analytics_tz(p text)
returns text language plpgsql stable set search_path = public
as $$
begin
  if p is null or p = '' then return 'Asia/Barnaul'; end if;
  perform now() at time zone p;
  return p;
exception when others then
  return 'Asia/Barnaul';
end
$$;

-- Люди, которых считаем: без служебных почт и (по флагу) без тарифа «Тест»
create or replace function public._analytics_users(p_exclude_emails text[], p_exclude_test boolean)
returns table (user_id uuid, email text, registered_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email::text, u.created_at
    from auth.users u
   where not (lower(coalesce(u.email, '')) = any (
           select lower(btrim(e)) from unnest(coalesce(p_exclude_emails, '{}'::text[])) e))
     and (not coalesce(p_exclude_test, false) or not exists (
           select 1 from public.user_subscription s join public.plans pl on pl.id = s.plan_id
            where s.user_id = u.id and pl.code = 'test'))
$$;

-- «Взяла текст» (синхронно с lib/analytics/definitions.ts, TAKE_EVENT):
-- события material_take, кроме how = published (их покрывает published_at),
-- плюс generated_posts.published_at (момент взятия = published_at).
-- p_user null = все люди.
create or replace function public._analytics_takes(p_user uuid)
returns table (user_id uuid, at timestamptz, post_id uuid, how text, format text)
language sql stable security definer set search_path = public
as $$
  select e.user_id, e.created_at, public._analytics_uuid(e.props->>'post'), e.props->>'how',
         public._analytics_fmt(e.props->>'format')
    from public.events e
   where e.event = 'material_take'
     and e.user_id is not null
     and coalesce(e.props->>'how', '') <> 'published'
     and (p_user is null or e.user_id = p_user)
  union all
  select g.user_id, g.published_at, g.id, 'published', public._analytics_fmt(g.format)
    from public.generated_posts g
   where g.published_at is not null
     and g.user_id is not null
     and (p_user is null or g.user_id = p_user)
$$;

-- Материалы: generated_posts без хуков и рерайтов. Тексты не берем.
create or replace function public._analytics_materials(p_user uuid)
returns table (id uuid, user_id uuid, format text, created_at timestamptz, published_at timestamptz,
               group_id uuid, status text)
language sql stable security definer set search_path = public
as $$
  select g.id, g.user_id, public._analytics_fmt(g.format), g.created_at, g.published_at, g.group_id, g.pipeline_status
    from public.generated_posts g
   where g.user_id is not null
     and g.created_at is not null
     and coalesce(g.format, '') <> 'hooks'
     and coalesce(g.format, '') not like 'rewrite%'
     and (p_user is null or g.user_id = p_user)
$$;

-- Вехи пути по каждому человеку: общие для людей, воронки, сводки и источников
create or replace function public._analytics_milestones(p_exclude_emails text[], p_exclude_test boolean, p_tz text)
returns table (
  user_id uuid, email text, registered_at timestamptz,
  plan_code text, plan_name text, plan_price integer, paying boolean, paying_since timestamptz,
  onboarded_at timestamptz, first_make_at timestamptz, first_material_at timestamptz,
  first_take_at timestamptz, second_take_at timestamptz, first_paywall_at timestamptz, src text
)
language sql stable security definer set search_path = public
as $$
  with u as (
    select * from public._analytics_users(p_exclude_emails, p_exclude_test)
  ), t as (
    select t.* from public._analytics_takes(null) t join u on u.user_id = t.user_id
  ), ft as (
    select t.user_id, min(t.at) as first_take_at from t group by t.user_id
  ), st as (
    -- второе взятие: первое взятие в другой день (в поясе p_tz), позже дня первого
    select t.user_id, min(t.at) as second_take_at
      from t join ft on ft.user_id = t.user_id
     where (t.at at time zone p_tz)::date > (ft.first_take_at at time zone p_tz)::date
     group by t.user_id
  ), ev as (
    select e.user_id,
           min(e.created_at) filter (where e.event = 'make_start') as first_make_ev,
           min(e.created_at) filter (where e.event in ('paywall_view', 'plan_click')) as first_paywall_at
      from public.events e join u on u.user_id = e.user_id
     where e.event in ('make_start', 'paywall_view', 'plan_click')
     group by e.user_id
  ), src as (
    select distinct on (e.user_id) e.user_id, coalesce(nullif(e.props->>'src', ''), e.props->>'ref') as src
      from public.events e join u on u.user_id = e.user_id
     where e.event = 'signup_source'
     order by e.user_id, e.created_at desc
  ), m as (
    select mm.user_id, min(mm.created_at) as first_material_at
      from public._analytics_materials(null) mm join u on u.user_id = mm.user_id
     group by mm.user_id
  ), p as (
    select op.user_id, min(coalesce(op.created_at, op.completed_at, now())) as onboarded_at
      from public.onboarding_profiles op join u on u.user_id = op.user_id
     group by op.user_id
  ), sub as (
    select s.user_id, pl.code, pl.name, pl.price, s.period_start, s.period_end
      from public.user_subscription s join public.plans pl on pl.id = s.plan_id
  )
  select u.user_id, u.email, u.registered_at,
         sub.code, sub.name, sub.price,
         coalesce(sub.code not in ('free', 'test') and (sub.period_end is null or sub.period_end > now()), false),
         case when sub.code not in ('free', 'test') and (sub.period_end is null or sub.period_end > now())
              then sub.period_start end,
         p.onboarded_at,
         least(ev.first_make_ev, m.first_material_at),
         m.first_material_at,
         ft.first_take_at,
         st.second_take_at,
         ev.first_paywall_at,
         src.src
    from u
    left join sub on sub.user_id = u.user_id
    left join p   on p.user_id = u.user_id
    left join ev  on ev.user_id = u.user_id
    left join m   on m.user_id = u.user_id
    left join ft  on ft.user_id = u.user_id
    left join st  on st.user_id = u.user_id
    left join src on src.user_id = u.user_id
$$;

-- ── 3. Риск ухода и статус одного человека ──
-- Синхронно с lib/analytics/definitions.ts (RISK, rhythmDays, habitOf, computeRisk, statusOf).
-- Стартовые веса, пересчитать по данным, когда наберется 50 ушедших.
create or replace function public.analytics_churn(p_user_id uuid, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  -- константы синхронно с lib/analytics/definitions.ts
  c_rhythm_default  constant numeric := 7;    -- RISK.RHYTHM_DEFAULT_DAYS
  c_rhythm_min      constant numeric := 1;    -- RISK.RHYTHM_MIN_DAYS
  c_rhythm_last     constant int     := 8;    -- RISK.RHYTHM_LAST_TAKES
  c_recency_2       constant int     := 25;   -- RISK.RECENCY_2
  c_recency_3       constant int     := 40;   -- RISK.RECENCY_3
  c_decline         constant int     := 20;   -- RISK.DECLINE
  c_empty_last3     constant int     := 20;   -- RISK.EMPTY_LAST3
  c_unhappy         constant int     := 15;   -- RISK.UNHAPPY
  c_unhappy_nl      constant int     := 2;    -- RISK.UNHAPPY_NOT_LIKE
  c_unhappy_edits   constant int     := 3;    -- RISK.UNHAPPY_STRONG_EDITS
  c_strong_ratio    constant numeric := 0.5;  -- RISK.STRONG_EDIT_RATIO
  c_errors          constant int     := 15;   -- RISK.ERRORS
  c_errors_min      constant int     := 2;    -- RISK.ERRORS_MIN
  c_limit           constant int     := 15;   -- RISK.LIMIT_NO_RETURN
  c_limit_days      constant int     := 3;    -- RISK.LIMIT_NO_RETURN_DAYS
  c_no_voice        constant int     := 10;   -- RISK.NO_VOICE
  c_no_voice_days   constant int     := 7;    -- RISK.NO_VOICE_DAYS
  c_habit           constant int     := -15;  -- RISK.HABIT
  c_published       constant int     := -10;  -- RISK.PUBLISHED_14
  c_attention       constant int     := 30;   -- RISK.ATTENTION
  c_high            constant int     := 60;   -- RISK.HIGH
  c_habit_weeks     constant int     := 3;    -- HABIT_WEEKS
  c_habit_min       constant int     := 2;    -- HABIT_MIN_WEEKS
  c_active_days     constant int     := 7;    -- ACTIVE_DAYS
  c_new_days        constant int     := 3;    -- NEW_DAYS
  c_stuck_after     constant int     := 1;    -- STUCK_AFTER_DAYS
  c_gone_min        constant int     := 14;   -- GONE_MIN_DAYS
  c_gone_rhythms    constant int     := 4;    -- GONE_RHYTHMS
  -- «вернулась после лимита»: событие позже 30 минут после limit_hit (то, что экран сам шлет
  -- сразу после отказа: paywall_view, error_shown, не считается возвращением) или plan_click в любой момент
  c_limit_grace     constant interval := interval '30 minutes';

  v_now timestamptz := now();
  v_today date;
  v_reg timestamptz;
  v_onb boolean;
  v_materials int;
  v_take_days date[];
  v_last_visit timestamptz;
  v_last_take timestamptz;
  v_takes_14 int;
  v_takes_prev int;
  v_last3 int;
  v_not_like int;
  v_strong int;
  v_errors int;
  v_last_limit timestamptz;
  v_limit_no_return boolean := false;
  v_voice_empty boolean;
  v_pub14 boolean;
  v_rhythm numeric := c_rhythm_default;
  v_silent numeric;
  v_ratio numeric;
  v_habit boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_score int := 0;
  v_level text := 'norm';
  v_status text;
  v_age numeric;
  v_since_visit numeric;
  v_has_risk boolean := false;
begin
  p_tz := public._analytics_tz(p_tz);
  v_today := (v_now at time zone p_tz)::date;

  select u.created_at into v_reg from auth.users u where u.id = p_user_id;
  if not found then
    return null;
  end if;

  select exists (select 1 from public.onboarding_profiles op where op.user_id = p_user_id) into v_onb;
  select not exists (select 1 from public.onboarding_profiles op
                      where op.user_id = p_user_id and nullif(btrim(op.voice_core), '') is not null)
    into v_voice_empty;
  select count(*) into v_materials from public._analytics_materials(p_user_id);

  select max(t.at),
         count(*) filter (where t.at > v_now - interval '14 days'),
         count(*) filter (where t.at <= v_now - interval '14 days' and t.at > v_now - interval '28 days')
    into v_last_take, v_takes_14, v_takes_prev
    from public._analytics_takes(p_user_id) t;

  select coalesce(array_agg(d order by d desc), '{}'::date[]) into v_take_days
    from (select distinct (t.at at time zone p_tz)::date as d from public._analytics_takes(p_user_id) t) x;

  -- сколько из трех последних материалов взято; null, если материалов меньше трех
  select case when count(*) < 3 then null else count(*) filter (where x.taken) end
    into v_last3
    from (select m.id,
                 exists (select 1 from public._analytics_takes(p_user_id) t where t.post_id = m.id) as taken
            from public._analytics_materials(p_user_id) m
           order by m.created_at desc, m.id
           limit 3) x;

  select count(*) filter (where v.kind = 'not_like'),
         count(*) filter (where v.kind = 'edit_pair'
                            and public._analytics_num(v.data->>'change_ratio') >= c_strong_ratio)
    into v_not_like, v_strong
    from public.voice_events v
   where v.user_id = p_user_id and v.created_at > v_now - interval '7 days';

  select count(*) into v_errors
    from public.events e
   where e.user_id = p_user_id and e.event in ('make_error', 'error_shown')
     and e.created_at > v_now - interval '7 days';

  select max(e.created_at) into v_last_visit from public.events e where e.user_id = p_user_id;

  select max(e.created_at) into v_last_limit
    from public.events e where e.user_id = p_user_id and e.event = 'limit_hit';
  if v_last_limit is not null and v_now - v_last_limit >= make_interval(days => c_limit_days) then
    v_limit_no_return := not exists (
      select 1 from public.events e
       where e.user_id = p_user_id and e.created_at > v_last_limit
         and (e.event = 'plan_click' or e.created_at > v_last_limit + c_limit_grace));
  end if;

  select exists (select 1 from public.generated_posts g
                  where g.user_id = p_user_id and g.published_at > v_now - interval '14 days')
    into v_pub14;

  -- риск только у тех, кто хоть раз брал текст
  v_has_risk := coalesce(array_length(v_take_days, 1), 0) > 0 and v_last_take is not null;

  if v_has_risk then
    -- личный ритм: медиана перерывов между последними 8 днями со взятием; меньше трех дней, значит 7
    if array_length(v_take_days, 1) >= 3 then
      select percentile_cont(0.5) within group (order by x.gap::float8)
        into v_rhythm
        from (select d - lead(d) over (order by d desc) as gap
                from unnest(v_take_days[1:c_rhythm_last]) as d) x
       where x.gap is not null;
      v_rhythm := greatest(c_rhythm_min, coalesce(v_rhythm, c_rhythm_default));
    end if;

    v_silent := extract(epoch from (v_now - v_last_take)) / 86400.0;
    v_ratio := v_silent / v_rhythm;

    -- привычка: дни со взятием в двух разных 7-дневных окнах из последних трех
    select count(distinct ((v_today - d) / 7)) >= c_habit_min into v_habit
      from unnest(v_take_days) as d
     where v_today - d >= 0 and v_today - d < c_habit_weeks * 7;

    -- порядок причин как в computeRisk
    if v_ratio > 3 then
      v_reasons := v_reasons || jsonb_build_object('code', 'recency', 'points', c_recency_3);
    elsif v_ratio > 2 then
      v_reasons := v_reasons || jsonb_build_object('code', 'recency', 'points', c_recency_2);
    end if;
    if v_takes_prev >= 2 and v_takes_14 < v_takes_prev / 2.0 then
      v_reasons := v_reasons || jsonb_build_object('code', 'decline', 'points', c_decline);
    end if;
    if v_last3 = 0 then
      v_reasons := v_reasons || jsonb_build_object('code', 'empty_last3', 'points', c_empty_last3);
    end if;
    if v_not_like >= c_unhappy_nl or v_strong >= c_unhappy_edits then
      v_reasons := v_reasons || jsonb_build_object('code', 'unhappy', 'points', c_unhappy);
    end if;
    if v_errors >= c_errors_min then
      v_reasons := v_reasons || jsonb_build_object('code', 'errors', 'points', c_errors);
    end if;
    if v_limit_no_return then
      v_reasons := v_reasons || jsonb_build_object('code', 'limit_no_return', 'points', c_limit);
    end if;
    if v_voice_empty and extract(epoch from (v_now - v_reg)) / 86400.0 >= c_no_voice_days then
      v_reasons := v_reasons || jsonb_build_object('code', 'no_voice', 'points', c_no_voice);
    end if;
    -- привычка работает, только пока тишина не дольше двух ритмов
    if v_habit and v_ratio <= 2 then
      v_reasons := v_reasons || jsonb_build_object('code', 'habit', 'points', c_habit);
    end if;
    if v_pub14 then
      v_reasons := v_reasons || jsonb_build_object('code', 'published', 'points', c_published);
    end if;

    select coalesce(sum((r->>'points')::int), 0) into v_score from jsonb_array_elements(v_reasons) r;
    v_score := greatest(0, least(100, v_score));
    v_level := case when v_score >= c_high then 'high' when v_score >= c_attention then 'attention' else 'norm' end;
  end if;

  -- статус (statusOf)
  v_age := extract(epoch from (v_now - v_reg)) / 86400.0;
  v_since_visit := coalesce(extract(epoch from (v_now - v_last_visit)) / 86400.0, v_age);
  if v_since_visit >= greatest(c_gone_min::numeric, c_gone_rhythms * v_rhythm) then
    v_status := 'gone';
  elsif v_last_take is not null and extract(epoch from (v_now - v_last_take)) / 86400.0 <= c_active_days then
    v_status := 'active';
  elsif v_has_risk and v_score >= c_attention then
    v_status := 'cooling';
  elsif v_age > c_stuck_after and (not v_onb or v_materials = 0) then
    v_status := 'stuck';
  elsif v_age < c_new_days and coalesce(array_length(v_take_days, 1), 0) = 0 then
    v_status := 'new';
  else
    v_status := 'trying';
  end if;

  return jsonb_build_object(
    'facts', jsonb_build_object(
      'registered_at', v_reg,
      'onboarded', v_onb,
      'materials', v_materials,
      'take_days', (select coalesce(jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d desc), '[]'::jsonb)
                      from unnest(v_take_days) as d),
      'last_visit_at', v_last_visit,
      'last_take_at', v_last_take,
      'takes_14', v_takes_14,
      'takes_prev_14', v_takes_prev,
      'last3_taken', v_last3,
      'not_like_7', v_not_like,
      'strong_edits_7', v_strong,
      'errors_7', v_errors,
      'limit_no_return', v_limit_no_return,
      'voice_core_empty', v_voice_empty,
      'published_14', v_pub14
    ),
    'score', v_score,
    'level', v_level,
    'reasons', v_reasons,
    'rhythm_days', trim_scale(round(v_rhythm, 2)),
    'status', v_status
  );
end
$$;

-- ── 4. Люди ──
create or replace function public.analytics_people(p_exclude_emails text[], p_exclude_test boolean, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz);

  with ms as (
    select * from public._analytics_milestones(p_exclude_emails, p_exclude_test, p_tz)
  ), ev as (
    select e.user_id,
           max(e.created_at) as last_visit_at,
           count(distinct e.session_id) filter (where e.created_at > now() - interval '7 days') as sessions_7,
           count(distinct (e.created_at at time zone p_tz)::date) filter (where e.created_at > now() - interval '30 days') as visit_days_30,
           bool_or(e.event = 'limit_hit') as limit_hit_ever,
           bool_or(e.event = 'limit_hit' and e.created_at > now() - interval '7 days') as limit_hit_7,
           bool_or(e.event in ('make_error', 'error_shown') and e.created_at > now() - interval '7 days') as error_7,
           max(public._analytics_num(e.props->>'step')) filter (where e.event = 'onb_step_view') as onb_last_step
      from public.events e join ms on ms.user_id = e.user_id
     group by e.user_id
  ), taken_posts as (
    select distinct t.post_id from public._analytics_takes(null) t where t.post_id is not null
  ), mat as (
    select m.user_id, count(*) as materials, count(tp.post_id) as materials_taken
      from public._analytics_materials(null) m
      left join taken_posts tp on tp.post_id = m.id
     group by m.user_id
  ), cost as (
    select ul.user_id,
           coalesce(sum(ul.real_cost_rub) filter (where ul.created_at > now() - interval '30 days'), 0) as rub_30,
           coalesce(sum(ul.real_cost_rub), 0) as rub_all
      from public.usage_log ul join ms on ms.user_id = ul.user_id
     group by ul.user_id
  ), prof as (
    select op.user_id, op.full_name from public.onboarding_profiles op join ms on ms.user_id = op.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', ms.user_id,
           'email', ms.email,
           'full_name', prof.full_name,
           'registered_at', ms.registered_at,
           'plan_code', ms.plan_code,
           'plan_name', ms.plan_name,
           'plan_price', ms.plan_price,
           'src', ms.src,
           'onb_last_step', ev.onb_last_step::int,
           'onb_done', ms.onboarded_at is not null,
           'first_make_at', ms.first_make_at,
           'first_material_at', ms.first_material_at,
           'first_take_at', ms.first_take_at,
           'second_take_at', ms.second_take_at,
           'first_paywall_at', ms.first_paywall_at,
           'paying', ms.paying,
           'last_visit_at', ev.last_visit_at,
           'sessions_7', coalesce(ev.sessions_7, 0),
           'visit_days_30', coalesce(ev.visit_days_30, 0),
           'materials', coalesce(mat.materials, 0),
           'materials_taken', coalesce(mat.materials_taken, 0),
           'cost_rub_30', round(coalesce(cost.rub_30, 0), 2),
           'cost_rub_all', round(coalesce(cost.rub_all, 0), 2),
           'limit_hit_ever', coalesce(ev.limit_hit_ever, false),
           'limit_hit_7', coalesce(ev.limit_hit_7, false),
           'error_7', coalesce(ev.error_7, false),
           'churn', public.analytics_churn(ms.user_id, p_tz)
         ) order by ms.registered_at desc), '[]'::jsonb)
    into v_res
    from ms
    left join ev   on ev.user_id = ms.user_id
    left join mat  on mat.user_id = ms.user_id
    left join cost on cost.user_id = ms.user_id
    left join prof on prof.user_id = ms.user_id;

  return v_res;
end
$$;

-- ── 5. Сводка ──
create or replace function public.analytics_overview(p_exclude_emails text[], p_exclude_test boolean, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  c_activation_days constant int := 3;  -- ACTIVATION_DAYS, синхронно с lib/analytics/definitions.ts
  c_active_days     constant int := 7;  -- ACTIVE_DAYS
  v_day_start timestamptz;
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz);
  -- начало сегодняшнего дня в поясе p_tz
  v_day_start := ((now() at time zone p_tz)::date)::timestamp at time zone p_tz;

  with u as (
    select * from public._analytics_users(p_exclude_emails, p_exclude_test)
  ), ms as (
    select * from public._analytics_milestones(p_exclude_emails, p_exclude_test, p_tz)
  )
  select jsonb_build_object(
    'took_7', (select count(distinct t.user_id) from public._analytics_takes(null) t join u on u.user_id = t.user_id
                where t.at > now() - make_interval(days => c_active_days)),
    'active_today', (select count(distinct e.user_id) from public.events e join u on u.user_id = e.user_id
                      where e.created_at >= v_day_start),
    'active_7', (select count(distinct e.user_id) from public.events e join u on u.user_id = e.user_id
                  where e.created_at > now() - interval '7 days'),
    'new_7', (select count(*) from u where u.registered_at > now() - interval '7 days'),
    'registered_all', (select count(*) from u),
    'activated_all', (select count(*) from ms
                       where ms.first_take_at is not null
                         and ms.first_take_at < ms.registered_at + make_interval(days => c_activation_days)),
    'cost_today_rub', (select round(coalesce(sum(ul.real_cost_rub), 0), 2) from public.usage_log ul
                        join u on u.user_id = ul.user_id where ul.created_at >= v_day_start),
    'cost_30_rub', (select round(coalesce(sum(ul.real_cost_rub), 0), 2) from public.usage_log ul
                     join u on u.user_id = ul.user_id where ul.created_at > now() - interval '30 days'),
    'limit_7', (select count(distinct e.user_id) from public.events e join u on u.user_id = e.user_id
                 where e.event = 'limit_hit' and e.created_at > now() - interval '7 days')
  ) into v_res;

  return v_res;
end
$$;

-- ── 6. Главная воронка (по людям, зарегистрированным в периоде) ──
create or replace function public.analytics_funnel(p_exclude_emails text[], p_exclude_test boolean,
                                                   p_from timestamptz, p_to timestamptz,
                                                   p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz);

  with ms as (
    select * from public._analytics_milestones(p_exclude_emails, p_exclude_test, p_tz) m
     where (p_from is null or m.registered_at >= p_from)
       and (p_to is null or m.registered_at < p_to)
  ), steps as (
    select ms.user_id, k.ord, k.at, k.prev_at
      from ms
     cross join lateral (values
       (1, ms.registered_at, null::timestamptz),
       (2, ms.onboarded_at, ms.registered_at),
       (3, ms.first_make_at, ms.onboarded_at),
       (4, ms.first_material_at, ms.first_make_at),
       (5, ms.first_take_at, ms.first_material_at),
       (6, ms.second_take_at, ms.first_take_at),
       (7, ms.first_paywall_at, ms.second_take_at),
       (8, case when ms.paying then coalesce(ms.paying_since, ms.registered_at) end, ms.first_paywall_at)
     ) as k(ord, at, prev_at)
  )
  select jsonb_agg(jsonb_build_object(
           'key', k.key,
           'n', a.n,
           'median_hours_from_prev', a.med,
           'users', a.users
         ) order by k.ord)
    into v_res
    from (values (1, 'registered'), (2, 'onboarded'), (3, 'first_make'), (4, 'first_material'),
                 (5, 'first_take'), (6, 'second_take'), (7, 'saw_paywall'), (8, 'paying')) as k(ord, key)
    cross join lateral (
      select count(*) filter (where s.at is not null) as n,
             round((percentile_cont(0.5) within group (
                      order by (greatest(0, extract(epoch from (s.at - s.prev_at))) / 3600.0)::float8)
                    filter (where s.at is not null and s.prev_at is not null))::numeric, 1) as med,
             coalesce(jsonb_agg(s.user_id) filter (where s.at is not null), '[]'::jsonb) as users
        from steps s
       where s.ord = k.ord
    ) a;

  return v_res;
end
$$;

-- ── 7. Онбординг по шагам (люди, зарегистрированные в периоде) ──
create or replace function public.analytics_onboarding(p_exclude_emails text[], p_exclude_test boolean,
                                                       p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  with u as (
    select uu.user_id from public._analytics_users(p_exclude_emails, p_exclude_test) uu
     where (p_from is null or uu.registered_at >= p_from)
       and (p_to is null or uu.registered_at < p_to)
  ), ev as (
    select e.user_id, e.event, e.created_at,
           public._analytics_num(e.props->>'step') as step,
           public._analytics_num(e.props->>'ms') as ms
      from public.events e join u on u.user_id = e.user_id
     where e.event in ('onb_intro', 'onb_step_view', 'onb_step_done', 'onb_done')
  ), per as (
    select u.user_id,
           (select max(ev.step) from ev where ev.user_id = u.user_id and ev.event = 'onb_step_view') as last_step,
           (exists (select 1 from ev where ev.user_id = u.user_id and ev.event = 'onb_done')
             or exists (select 1 from public.onboarding_profiles op where op.user_id = u.user_id)) as finished
      from u
  )
  select jsonb_build_object(
    'intro', (select count(distinct ev.user_id) from ev where ev.event = 'onb_intro'),
    'finished', (select count(*) from per where per.finished),
    'steps', (
      select jsonb_agg(jsonb_build_object(
               'step', s.step,
               'viewed', (select count(distinct ev.user_id) from ev where ev.event = 'onb_step_view' and ev.step = s.step),
               'done', (select count(distinct ev.user_id) from ev where ev.event = 'onb_step_done' and ev.step = s.step),
               'median_ms', (select round((percentile_cont(0.5) within group (order by ev.ms::float8))::numeric)
                               from ev where ev.event = 'onb_step_done' and ev.step = s.step and ev.ms is not null),
               'dropped', (select count(*) from per where per.last_step = s.step and not per.finished),
               'dropped_users', (select coalesce(jsonb_agg(per.user_id), '[]'::jsonb)
                                   from per where per.last_step = s.step and not per.finished)
             ) order by s.step)
        from generate_series(1, 5) as s(step)
    )
  ) into v_res;

  return v_res;
end
$$;

-- ── 8. «Сделать» (события и материалы в периоде) ──
create or replace function public.analytics_make(p_exclude_emails text[], p_exclude_test boolean,
                                                 p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  with u as (
    select uu.user_id from public._analytics_users(p_exclude_emails, p_exclude_test) uu
  ), ev as (
    select e.event, e.props
      from public.events e join u on u.user_id = e.user_id
     where e.event in ('make_start', 'make_done', 'make_error')
       and (p_from is null or e.created_at >= p_from)
       and (p_to is null or e.created_at < p_to)
  ), taken_posts as (
    select distinct t.post_id from public._analytics_takes(null) t where t.post_id is not null
  ), mats as (
    select m.id, m.format, (tp.post_id is not null) as taken
      from public._analytics_materials(null) m
      join u on u.user_id = m.user_id
      left join taken_posts tp on tp.post_id = m.id
     where (p_from is null or m.created_at >= p_from)
       and (p_to is null or m.created_at < p_to)
  ), started as (
    select public._analytics_fmt(btrim(f)) as format, count(*) as n
      from ev, unnest(string_to_array(ev.props->>'formats', ',')) as f
     where ev.event = 'make_start' and btrim(f) <> ''
     group by 1
  ), made as (
    select coalesce(mats.format, 'unknown') as format, count(*) as materials, count(*) filter (where mats.taken) as taken
      from mats group by 1
  )
  select jsonb_build_object(
    'starts', (select count(*) from ev where ev.event = 'make_start'),
    'done', (select count(*) from ev where ev.event = 'make_done'),
    'errors', (select count(*) from ev where ev.event = 'make_error'),
    'median_ms', (select round((percentile_cont(0.5) within group (order by public._analytics_num(ev.props->>'ms')::float8))::numeric)
                    from ev where ev.event = 'make_done' and public._analytics_num(ev.props->>'ms') is not null),
    'materials', (select count(*) from mats),
    'taken', (select count(*) from mats where mats.taken),
    'by_format', (select coalesce(jsonb_agg(jsonb_build_object(
                           'format', coalesce(st.format, md.format),
                           'started', coalesce(st.n, 0),
                           'materials', coalesce(md.materials, 0),
                           'taken', coalesce(md.taken, 0)
                         ) order by coalesce(st.n, 0) + coalesce(md.materials, 0) desc, coalesce(st.format, md.format)), '[]'::jsonb)
                    from started st full join made md on md.format = st.format),
    'by_mode', (select coalesce(jsonb_agg(jsonb_build_object('mode', x.mode, 'n', x.n) order by x.n desc, x.mode), '[]'::jsonb)
                  from (select coalesce(ev.props->>'mode', 'unknown') as mode, count(*) as n
                          from ev where ev.event = 'make_start' group by 1) x),
    'errors_by_code', (select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'n', x.n) order by x.n desc, x.code), '[]'::jsonb)
                         from (select coalesce(ev.props->>'code', 'unknown') as code, count(*) as n
                                 from ev where ev.event = 'make_error' group by 1) x)
  ) into v_res;

  return v_res;
end
$$;

-- ── 9. Функции, экраны, форматы, стили каруселей ──
create or replace function public.analytics_features(p_exclude_emails text[], p_exclude_test boolean, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz); -- окна 7 и 30 дней считаются от текущего момента, пояс оставлен для единой сигнатуры

  with u as (
    select uu.user_id from public._analytics_users(p_exclude_emails, p_exclude_test) uu
  ), ev as (
    select e.user_id, e.event, e.created_at, e.props
      from public.events e join u on u.user_id = e.user_id
     where e.event in ('feature_open', 'screen_view')
  ), taken_posts as (
    select distinct t.post_id from public._analytics_takes(null) t where t.post_id is not null
  ), mats as (
    select m.user_id, coalesce(m.format, 'unknown') as format, (tp.post_id is not null) as taken
      from public._analytics_materials(null) m
      join u on u.user_id = m.user_id
      left join taken_posts tp on tp.post_id = m.id
     where m.created_at > now() - interval '30 days'
  )
  select jsonb_build_object(
    'features', (select coalesce(jsonb_agg(jsonb_build_object('feature', x.k, 'users_7', x.u7, 'users_30', x.u30, 'times_30', x.t30)
                                           order by x.u30 desc, x.k), '[]'::jsonb)
                   from (select coalesce(ev.props->>'feature', 'unknown') as k,
                                count(distinct ev.user_id) filter (where ev.created_at > now() - interval '7 days') as u7,
                                count(distinct ev.user_id) filter (where ev.created_at > now() - interval '30 days') as u30,
                                count(*) filter (where ev.created_at > now() - interval '30 days') as t30
                           from ev where ev.event = 'feature_open' group by 1) x),
    'screens', (select coalesce(jsonb_agg(jsonb_build_object('screen', x.k, 'users_7', x.u7, 'users_30', x.u30, 'times_30', x.t30)
                                          order by x.u30 desc, x.k), '[]'::jsonb)
                  from (select coalesce(ev.props->>'screen', 'unknown') as k,
                               count(distinct ev.user_id) filter (where ev.created_at > now() - interval '7 days') as u7,
                               count(distinct ev.user_id) filter (where ev.created_at > now() - interval '30 days') as u30,
                               count(*) filter (where ev.created_at > now() - interval '30 days') as t30
                          from ev where ev.event = 'screen_view' group by 1) x),
    'formats', (select coalesce(jsonb_agg(jsonb_build_object('format', x.format, 'made_30', x.made, 'taken_30', x.taken, 'users_30', x.users)
                                          order by x.made desc, x.format), '[]'::jsonb)
                  from (select mats.format, count(*) as made, count(*) filter (where mats.taken) as taken,
                               count(distinct mats.user_id) as users
                          from mats group by 1) x),
    'carousel_styles', (select coalesce(jsonb_agg(jsonb_build_object('style', x.style, 'carousels', x.carousels, 'exports', x.exports)
                                                  order by x.exports desc, x.style), '[]'::jsonb)
                          from (select cd.style, count(*) filter (where cd.export_count > 0) as carousels,
                                       coalesce(sum(cd.export_count), 0) as exports
                                  from public.carousel_designs cd join u on u.user_id = cd.user_id
                                 group by cd.style) x)
  ) into v_res;

  return v_res;
end
$$;

-- ── 10. Деньги и экономика ──
create or replace function public.analytics_costs(p_exclude_emails text[], p_exclude_test boolean,
                                                  p_from timestamptz, p_to timestamptz,
                                                  p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  c_over_plan_share constant numeric := 0.15;  -- COST_OVER_PLAN_SHARE, синхронно с lib/analytics/definitions.ts
  c_activation_days constant int := 3;         -- ACTIVATION_DAYS
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz);

  with ms as (
    select * from public._analytics_milestones(p_exclude_emails, p_exclude_test, p_tz)
  ), ul as (
    select l.user_id, l.created_at, coalesce(l.operation, 'unknown') as operation, coalesce(l.model, 'unknown') as model,
           coalesce(l.real_cost_rub, 0) as rub
      from public.usage_log l join ms on ms.user_id = l.user_id
     where (p_from is null or l.created_at >= p_from)
       and (p_to is null or l.created_at < p_to)
  ), rub30 as (
    select l.user_id, coalesce(sum(l.real_cost_rub), 0) as rub
      from public.usage_log l join ms on ms.user_id = l.user_id
     where l.created_at > now() - interval '30 days'
     group by l.user_id
  ), taken_posts as (
    select distinct t.post_id from public._analytics_takes(null) t where t.post_id is not null
  ), mats as (
    select m.id, (tp.post_id is not null) as taken
      from public._analytics_materials(null) m
      join ms on ms.user_id = m.user_id
      left join taken_posts tp on tp.post_id = m.id
     where (p_from is null or m.created_at >= p_from)
       and (p_to is null or m.created_at < p_to)
  )
  select jsonb_build_object(
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(x.d, 'YYYY-MM-DD'), 'rub', round(x.rub, 2)) order by x.d), '[]'::jsonb)
                 from (select (ul.created_at at time zone p_tz)::date as d, sum(ul.rub) as rub from ul group by 1) x),
    'by_operation', (select coalesce(jsonb_agg(jsonb_build_object('operation', x.k, 'rub', round(x.rub, 2), 'calls', x.n) order by x.rub desc, x.k), '[]'::jsonb)
                       from (select ul.operation as k, sum(ul.rub) as rub, count(*) as n from ul group by 1) x),
    'by_model', (select coalesce(jsonb_agg(jsonb_build_object('model', x.k, 'rub', round(x.rub, 2), 'calls', x.n) order by x.rub desc, x.k), '[]'::jsonb)
                   from (select ul.model as k, sum(ul.rub) as rub, count(*) as n from ul group by 1) x),
    'top_users', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', x.email, 'rub', round(x.rub, 2)) order by x.rub desc), '[]'::jsonb)
                    from (select ul.user_id, ms.email, sum(ul.rub) as rub
                            from ul join ms on ms.user_id = ul.user_id
                           group by ul.user_id, ms.email
                           order by sum(ul.rub) desc
                           limit 20) x),
    'total_rub', (select round(coalesce(sum(ul.rub), 0), 2) from ul),
    'materials', (select count(*) from mats),
    'taken', (select count(*) from mats where mats.taken),
    'over_plan', (select coalesce(jsonb_agg(jsonb_build_object('user_id', ms.user_id, 'email', ms.email, 'plan_code', ms.plan_code,
                                                               'plan_price', ms.plan_price, 'rub_30', round(r.rub, 2))
                                            order by r.rub desc), '[]'::jsonb)
                    from ms join rub30 r on r.user_id = ms.user_id
                   where ms.paying and coalesce(ms.plan_price, 0) > 0
                     and r.rub > c_over_plan_share * ms.plan_price),
    'economy', jsonb_build_object(
      'paying', (select count(*) from ms where ms.paying),
      'mrr', (select coalesce(sum(ms.plan_price), 0) from ms where ms.paying),
      -- подписки платных тарифов, закончившиеся за 30 дней (сейчас не платят). Если тариф вручную
      -- переключили обратно на free, строка подписки одна на человека и такой уход здесь не виден.
      'churned_paying_30', (select count(*)
                              from public.user_subscription s
                              join public.plans pl on pl.id = s.plan_id
                              join ms on ms.user_id = s.user_id
                             where pl.code not in ('free', 'test')
                               and s.period_end > now() - interval '30 days'
                               and s.period_end <= now()),
      'ai_rub_30_paying', (select round(coalesce(sum(r.rub), 0), 2) from rub30 r join ms on ms.user_id = r.user_id where ms.paying),
      'plans', (select coalesce(jsonb_agg(jsonb_build_object('code', pl.code, 'name', pl.name, 'price', pl.price,
                                                             'users', x.users, 'ai_rub_30', round(x.rub, 2))
                                          order by pl.price, pl.code), '[]'::jsonb)
                  from public.plans pl
                  cross join lateral (
                    select count(*) as users, coalesce(sum(r.rub), 0) as rub
                      from ms left join rub30 r on r.user_id = ms.user_id
                     where ms.plan_code = pl.code
                       and (pl.code in ('free', 'test') or ms.paying)
                  ) x)
    ),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('src', x.src, 'users', x.users, 'activated', x.activated, 'paying', x.paying)
                                          order by x.users desc, x.src), '[]'::jsonb)
                  from (select coalesce(nullif(ms.src, ''), 'unknown') as src,
                               count(*) as users,
                               count(*) filter (where ms.first_take_at is not null
                                                  and ms.first_take_at < ms.registered_at + make_interval(days => c_activation_days)) as activated,
                               count(*) filter (where ms.paying) as paying
                          from ms
                         where (p_from is null or ms.registered_at >= p_from)
                           and (p_to is null or ms.registered_at < p_to)
                         group by 1) x)
  ) into v_res;

  return v_res;
end
$$;

-- ── 11. Карточка человека ──
create or replace function public.analytics_person(p_user_id uuid, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_email text;
  v_reg timestamptz;
  v_res jsonb;
  v_period text := to_char(now() at time zone 'UTC', 'YYYY-MM');
begin
  p_tz := public._analytics_tz(p_tz);

  select u.email::text, u.created_at into v_email, v_reg from auth.users u where u.id = p_user_id;
  if not found then
    return null;
  end if;

  with sub as (
    select pl.code, pl.name, pl.price, pl.fair_use_text_cap
      from public.user_subscription s join public.plans pl on pl.id = s.plan_id
     where s.user_id = p_user_id
     limit 1
  ), taken_posts as (
    select distinct t.post_id from public._analytics_takes(p_user_id) t where t.post_id is not null
  ), mats as (
    select m.format, (tp.post_id is not null) as taken
      from public._analytics_materials(p_user_id) m
      left join taken_posts tp on tp.post_id = m.id
  ), onb as (
    select e.event, e.created_at, public._analytics_num(e.props->>'step') as step,
           public._analytics_num(e.props->>'ms') as ms
      from public.events e
     where e.user_id = p_user_id
       and e.event in ('onb_intro', 'onb_step_view', 'onb_step_done', 'onb_done', 'onb_mic_denied')
  ), tl as (
    select e.created_at as at,
           jsonb_build_object('at', e.created_at, 'type', 'event', 'event', e.event, 'props', e.props) as item
      from public.events e where e.user_id = p_user_id
    union all
    select g.created_at,
           jsonb_build_object('at', g.created_at, 'type', 'material', 'format', public._analytics_fmt(g.format),
                              'group_id', g.group_id, 'status', g.pipeline_status)
      from public.generated_posts g where g.user_id = p_user_id and g.created_at is not null
    union all
    select g.published_at,
           jsonb_build_object('at', g.published_at, 'type', 'published', 'format', public._analytics_fmt(g.format))
      from public.generated_posts g where g.user_id = p_user_id and g.published_at is not null
    union all
    select cd.exported_at,
           jsonb_build_object('at', cd.exported_at, 'type', 'export', 'method', cd.export_method,
                              'style', cd.style, 'count', cd.export_count)
      from public.carousel_designs cd where cd.user_id = p_user_id and cd.exported_at is not null
    union all
    select v.created_at,
           jsonb_build_object('at', v.created_at, 'type', 'voice', 'kind', v.kind,
                              'change_ratio', public._analytics_num(v.data->>'change_ratio'))
      from public.voice_events v where v.user_id = p_user_id and v.created_at is not null
  ), money as (
    select coalesce(l.operation, 'unknown') as operation, coalesce(l.model, 'unknown') as model, coalesce(l.real_cost_rub, 0) as rub,
           l.created_at > now() - interval '30 days' as in_30
      from public.usage_log l where l.user_id = p_user_id
  )
  select jsonb_build_object(
    'user_id', p_user_id,
    'email', v_email,
    'full_name', (select op.full_name from public.onboarding_profiles op where op.user_id = p_user_id limit 1),
    'registered_at', v_reg,
    'plan_code', (select sub.code from sub),
    'plan_name', (select sub.name from sub),
    'plan_price', (select sub.price from sub),
    'src', (select coalesce(nullif(e.props->>'src', ''), e.props->>'ref') from public.events e
             where e.user_id = p_user_id and e.event = 'signup_source'
             order by e.created_at desc limit 1),
    'last_visit_at', (select max(e.created_at) from public.events e where e.user_id = p_user_id),
    'churn', public.analytics_churn(p_user_id, p_tz),
    'onboarding', (select jsonb_agg(jsonb_build_object(
                            'step', s.step,
                            'viewed_at', (select min(onb.created_at) from onb where onb.event = 'onb_step_view' and onb.step = s.step),
                            'done_at', (select min(onb.created_at) from onb where onb.event = 'onb_step_done' and onb.step = s.step),
                            'ms', (select onb.ms from onb where onb.event = 'onb_step_done' and onb.step = s.step
                                    order by onb.created_at limit 1)
                          ) order by s.step)
                     from generate_series(1, 5) as s(step)),
    'intro_at', (select min(onb.created_at) from onb where onb.event = 'onb_intro'),
    'done_at', coalesce((select min(onb.created_at) from onb where onb.event = 'onb_done'),
                        (select coalesce(op.created_at, op.completed_at) from public.onboarding_profiles op
                          where op.user_id = p_user_id limit 1)),
    'mic_denied', exists (select 1 from onb where onb.event = 'onb_mic_denied'),
    'timeline', (select coalesce(jsonb_agg(x.item order by x.at desc), '[]'::jsonb)
                   from (select tl.at, tl.item from tl order by tl.at desc limit 300) x),
    'features', (select coalesce(jsonb_agg(jsonb_build_object('feature', x.k, 'n', x.n) order by x.n desc, x.k), '[]'::jsonb)
                   from (select coalesce(e.props->>'feature', 'unknown') as k, count(*) as n
                           from public.events e where e.user_id = p_user_id and e.event = 'feature_open'
                          group by 1) x),
    'formats', (select coalesce(jsonb_agg(jsonb_build_object('format', x.format, 'made', x.made, 'taken', x.taken) order by x.made desc, x.format), '[]'::jsonb)
                  from (select coalesce(mats.format, 'unknown') as format, count(*) as made,
                               count(*) filter (where mats.taken) as taken
                          from mats group by 1) x),
    'voice', jsonb_build_object(
      'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'n', x.n) order by x.n desc, x.kind), '[]'::jsonb)
                    from (select v.kind, count(*) as n from public.voice_events v where v.user_id = p_user_id group by v.kind) x),
      'weeks', (select coalesce(jsonb_agg(jsonb_build_object(
                         'week', to_char(x.week, 'YYYY-MM-DD'),
                         'copied_clean', x.copied_clean, 'edited', x.edited,
                         'avg_change_ratio', x.avg_change_ratio, 'not_like', x.not_like, 'mine', x.mine
                       ) order by x.week desc), '[]'::jsonb)
                  -- та же формула, что во view voice_learning_stats, но change_ratio читается безопасно:
                  -- во view стоит прямой ::numeric, и одна строка с нечислом роняла бы всю карточку
                  from (select date_trunc('week', v.created_at) as week,
                               count(*) filter (where v.kind = 'copied_clean') as copied_clean,
                               count(*) filter (where v.kind = 'edit_pair') as edited,
                               round(avg(public._analytics_num(v.data->>'change_ratio')) filter (where v.kind = 'edit_pair'), 3) as avg_change_ratio,
                               count(*) filter (where v.kind = 'not_like') as not_like,
                               count(*) filter (where v.kind = 'mine') as mine
                          from public.voice_events v
                         where v.user_id = p_user_id and v.created_at is not null
                         group by 1
                         order by 1 desc
                         limit 12) x)
    ),
    'money', jsonb_build_object(
      'rub_30', (select round(coalesce(sum(money.rub) filter (where money.in_30), 0), 2) from money),
      'rub_all', (select round(coalesce(sum(money.rub), 0), 2) from money),
      'by_operation_30', (select coalesce(jsonb_agg(jsonb_build_object('operation', x.k, 'rub', round(x.rub, 2), 'calls', x.n) order by x.rub desc, x.k), '[]'::jsonb)
                            from (select money.operation as k, sum(money.rub) as rub, count(*) as n
                                    from money where money.in_30 group by 1) x),
      'by_model_30', (select coalesce(jsonb_agg(jsonb_build_object('model', x.k, 'rub', round(x.rub, 2), 'calls', x.n) order by x.rub desc, x.k), '[]'::jsonb)
                        from (select money.model as k, sum(money.rub) as rub, count(*) as n
                                from money where money.in_30 group by 1) x),
      'by_operation_all', (select coalesce(jsonb_agg(jsonb_build_object('operation', x.k, 'rub', round(x.rub, 2), 'calls', x.n) order by x.rub desc, x.k), '[]'::jsonb)
                             from (select money.operation as k, sum(money.rub) as rub, count(*) as n
                                     from money group by 1) x)
    ),
    -- счетчик текста: период как в lib/energy.ts periodKey (месяц сервера, здесь UTC)
    'text_usage', jsonb_build_object(
      'period', v_period,
      'count', coalesce((select c.count from public.text_usage_counter c
                          where c.user_id = p_user_id and c.period = v_period), 0),
      'cap', (select sub.fair_use_text_cap from sub)
    )
  ) into v_res;

  return v_res;
end
$$;

-- ── 12. Права: вызывать функции может только сервер (service_role) ──
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._analytics_fmt(text)',
    'public._analytics_num(text)',
    'public._analytics_uuid(text)',
    'public._analytics_tz(text)',
    'public._analytics_users(text[], boolean)',
    'public._analytics_takes(uuid)',
    'public._analytics_materials(uuid)',
    'public._analytics_milestones(text[], boolean, text)',
    'public.analytics_churn(uuid, text)',
    'public.analytics_people(text[], boolean, text)',
    'public.analytics_overview(text[], boolean, text)',
    'public.analytics_funnel(text[], boolean, timestamptz, timestamptz, text)',
    'public.analytics_onboarding(text[], boolean, timestamptz, timestamptz)',
    'public.analytics_make(text[], boolean, timestamptz, timestamptz)',
    'public.analytics_features(text[], boolean, text)',
    'public.analytics_costs(text[], boolean, timestamptz, timestamptz, text)',
    'public.analytics_person(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
