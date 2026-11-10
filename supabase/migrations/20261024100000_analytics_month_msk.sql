-- Аналитика: месяц счетчика текстов в карточке человека по Москве (24.10.2026). ПРИМЕНЕНА 22.10 вручную.
-- С 23.10 лимиты тарифов считаются по Москве (lib/energy.ts periodKey и limitPeriod, полночь 1 числа по Europe/Moscow),
-- а analytics_person брала ключ месяца text_usage_counter по UTC: в первые 3 часа месяца по Москве карточка
-- в /admin показывала прошлый ключ. Календарный месяц в аналитике считается только здесь (остальные функции берут
-- дни в p_tz и окна по interval), поэтому переопределяется одна функция. Тело скопировано из 20261005100000
-- целиком, изменена ровно одна строка v_period (сверено скриптом scripts/check-month-msk.ts). Права те же.

create or replace function public.analytics_person(p_user_id uuid, p_tz text default 'Asia/Barnaul')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
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
$$;

revoke execute on function public.analytics_person(uuid, text) from public, anon, authenticated;
grant execute on function public.analytics_person(uuid, text) to service_role;
