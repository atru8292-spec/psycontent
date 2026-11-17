-- Траты на нейросеть в /admin только по строкам usage_log с model (16.11, блок 1 запуска, решение Арины).
-- Почему: commitConsume (lib/energy.ts logUsage) пишет при списании оценочную строку без model с прикидкой цены,
-- а logAiUsage пишет настоящую строку по токенам с model. Сводка и «Деньги» складывали обе, траты выходили примерно вдвое
-- больше (16.11: 50,50 ₽ вместо 23,89 ₽). Проверено на боевой базе: настоящих трат без model нет (без model только
-- 7 оценочных строк generate_post, 9,50 ₽), фильтр историю не теряет.
-- Тела функций взяты из живой базы (pg_get_functiondef 16.11), изменено только условие model is not null в выборках usage_log.
-- Права (execute только у service_role) create or replace не меняет, но для надежности повторены ниже.

CREATE OR REPLACE FUNCTION public.analytics_people(p_exclude_emails text[], p_exclude_test boolean, p_tz text DEFAULT 'Asia/Barnaul'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     where ul.model is not null
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
$function$;

CREATE OR REPLACE FUNCTION public.analytics_person(p_user_id uuid, p_tz text DEFAULT 'Asia/Barnaul'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_reg timestamptz;
  v_res jsonb;
  v_period text := to_char(now() at time zone 'Europe/Moscow', 'YYYY-MM');
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
      from public.usage_log l where l.user_id = p_user_id and l.model is not null
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
    -- счетчик текста: период как в lib/energy.ts periodKey (месяц по Москве)
    'text_usage', jsonb_build_object(
      'period', v_period,
      'count', coalesce((select c.count from public.text_usage_counter c
                          where c.user_id = p_user_id and c.period = v_period), 0),
      'cap', (select sub.fair_use_text_cap from sub)
    )
  ) into v_res;

  return v_res;
end
$function$;

CREATE OR REPLACE FUNCTION public.analytics_overview(p_exclude_emails text[], p_exclude_test boolean, p_tz text DEFAULT 'Asia/Barnaul'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_activation_days constant int := 3;  -- ACTIVATION_DAYS, синхронно с lib/analytics/definitions.ts
  c_active_days     constant int := 7;  -- ACTIVE_DAYS
  v_day_start timestamptz;
  v_res jsonb;
begin
  p_tz := public._analytics_tz(p_tz);
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
                        join u on u.user_id = ul.user_id where ul.model is not null and ul.created_at >= v_day_start),
    'cost_30_rub', (select round(coalesce(sum(ul.real_cost_rub), 0), 2) from public.usage_log ul
                     join u on u.user_id = ul.user_id where ul.model is not null and ul.created_at > now() - interval '30 days'),
    'limit_7', (select count(distinct e.user_id) from public.events e join u on u.user_id = e.user_id
                 where e.event = 'limit_hit' and e.created_at > now() - interval '7 days')
  ) into v_res;
  return v_res;
end
$function$;

CREATE OR REPLACE FUNCTION public.analytics_costs(p_exclude_emails text[], p_exclude_test boolean, p_from timestamp with time zone, p_to timestamp with time zone, p_tz text DEFAULT 'Asia/Barnaul'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     where l.model is not null
       and (p_from is null or l.created_at >= p_from)
       and (p_to is null or l.created_at < p_to)
  ), rub30 as (
    select l.user_id, coalesce(sum(l.real_cost_rub), 0) as rub
      from public.usage_log l join ms on ms.user_id = l.user_id
     where l.model is not null and l.created_at > now() - interval '30 days'
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
$function$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('analytics_costs', 'analytics_overview', 'analytics_people', 'analytics_person')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
