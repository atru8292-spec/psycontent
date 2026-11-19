-- ─────────────────────────────────────────────────────────────────────────
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да».
--
-- Зачем: lib/energy.ts canConsume читал счетчик материалов (text_usage_counter),
-- а commitConsume прибавлял +1 только после генерации, через 20-100 с. Две
-- вкладки, запущенные одновременно при остатке 1, обе проходили проверку,
-- и пробные 10 или месячный лимит обходились параллельными запусками.
--
-- Как теперь: резерв в момент проверки.
--   reserve_text_usage   под замком пользователя считает счетчик плюс живые
--                        резервы; если места нет, отказ; иначе пишет резерв.
--   commit_text_reserve  под тем же замком +N к счетчику и -N от резерва
--                        (сумма «счетчик + резерв» не меняется, окна нет).
--   release_text_reserve текст не выдан: резерв удаляется, место свободно.
-- Резерв живет 15 минут: если сервер упал и не отпустил его, место вернется
-- само. Генерация длится до 2 минут, 15 минут с запасом.
-- Замок: pg_advisory_xact_lock по пользователю, держится до конца вызова.
-- Он сериализует только резервы и списания этого человека, другие не ждут.
--
-- Код выкатывается и до этой миграции: если функции нет (PGRST202 / 42883),
-- canConsume идет старым путем (чтение счетчика, гонка там остается).
--
-- Права: функции SECURITY DEFINER принимают любой user_id и работают мимо
-- RLS, поэтому вызывать их может только сервер (service_role), как
-- increment_text_usage в 20261112100100. Таблица резервов только для сервера:
-- RLS включен без политик, права anon и authenticated сняты.
--
-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ (ожидается anon false, authed false, service true в каждой строке):
--   select f, has_function_privilege('anon', f, 'execute') as anon,
--          has_function_privilege('authenticated', f, 'execute') as authed,
--          has_function_privilege('service_role', f, 'execute') as service
--   from unnest(array['public.reserve_text_usage(uuid,text,integer,integer,boolean)',
--                     'public.commit_text_reserve(uuid,uuid,text,integer)',
--                     'public.release_text_reserve(uuid,uuid)']) as f;
--   select relrowsecurity from pg_class where oid = 'public.text_usage_reserve'::regclass;  -- true
-- Снаружи: POST /rest/v1/rpc/reserve_text_usage с anon-ключом дает 42501 или 404.
-- Сценарии на временной базе (PGlite, без сети): scripts/sql/test-text-reserve.ts.
--
-- ОТКАТ (код сам вернется на старый путь):
--   drop function if exists public.reserve_text_usage(uuid, text, integer, integer, boolean);
--   drop function if exists public.commit_text_reserve(uuid, uuid, text, integer);
--   drop function if exists public.release_text_reserve(uuid, uuid);
--   drop table if exists public.text_usage_reserve;
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.text_usage_reserve (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  units integer not null check (units > 0),
  created_at timestamptz not null default now()
);

create index if not exists text_usage_reserve_user_idx
  on public.text_usage_reserve (user_id, created_at);

alter table public.text_usage_reserve enable row level security;
revoke all on table public.text_usage_reserve from public, anon, authenticated;
grant select, insert, update, delete on table public.text_usage_reserve to service_role;

-- Резерв p_units материалов. p_free: бесплатный (пробные без срока: счетчик и
-- резервы за все календарные месяцы, без окон 'w...' оплаченных подписок, как
-- usedForLimit в lib/energy.ts); иначе только ключ p_period (окно или месяц).
-- Ответ: {ok:false, used} или {ok:true, id, used}; used без нового резерва.
create or replace function public.reserve_text_usage(
  p_user_id uuid, p_period text, p_cap integer, p_units integer, p_free boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counted integer;
  v_reserved integer;
  v_used integer;
  v_id uuid;
begin
  if p_user_id is null or p_period is null or p_cap is null or p_units is null or p_units <= 0 then
    raise exception 'reserve_text_usage: bad arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('text_reserve:' || p_user_id::text, 0));

  -- просроченные резервы этого человека больше не держат место
  delete from public.text_usage_reserve
   where user_id = p_user_id and created_at <= now() - interval '15 minutes';

  if p_free then
    select coalesce(sum(count), 0) into v_counted from public.text_usage_counter
     where user_id = p_user_id and period not like 'w%';
    select coalesce(sum(units), 0) into v_reserved from public.text_usage_reserve
     where user_id = p_user_id and period not like 'w%';
  else
    select coalesce(sum(count), 0) into v_counted from public.text_usage_counter
     where user_id = p_user_id and period = p_period;
    select coalesce(sum(units), 0) into v_reserved from public.text_usage_reserve
     where user_id = p_user_id and period = p_period;
  end if;

  v_used := v_counted + v_reserved;
  if v_used + p_units > p_cap then
    return jsonb_build_object('ok', false, 'used', v_used);
  end if;

  insert into public.text_usage_reserve (user_id, period, units)
  values (p_user_id, p_period, p_units)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'used', v_used);
end;
$$;

-- Текст выдан: +p_units к счетчику, столько же снимаем с резерва (при 0 удаляем).
-- Ключ счетчика берется из резерва; если резерв уже истек, из p_period (текст
-- все равно выдан, материал засчитывается). Резерв чужого user_id не трогаем.
-- Ответ: {count: новое значение счетчика, left: сколько осталось в резерве}.
create or replace function public.commit_text_reserve(
  p_id uuid, p_user_id uuid, p_period text, p_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_units integer;
  v_period text;
  v_count integer;
  v_left integer := 0;
begin
  if p_user_id is null or p_period is null or p_units is null or p_units <= 0 then
    raise exception 'commit_text_reserve: bad arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('text_reserve:' || p_user_id::text, 0));

  select units, period into v_units, v_period from public.text_usage_reserve
   where id = p_id and user_id = p_user_id
   for update;

  insert into public.text_usage_counter (user_id, period, count)
  values (p_user_id, coalesce(v_period, p_period), p_units)
  on conflict (user_id, period)
  do update set count = text_usage_counter.count + excluded.count
  returning count into v_count;

  if v_units is not null then
    if v_units <= p_units then
      delete from public.text_usage_reserve where id = p_id;
    else
      v_left := v_units - p_units;
      update public.text_usage_reserve set units = v_left where id = p_id;
    end if;
  end if;

  return jsonb_build_object('count', v_count, 'left', v_left);
end;
$$;

-- Текст не выдан (сбой модели, отказ, ушла из запроса): остаток резерва удаляется.
create or replace function public.release_text_reserve(p_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.text_usage_reserve where id = p_id and user_id = p_user_id;
$$;

revoke execute on function public.reserve_text_usage(uuid, text, integer, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.commit_text_reserve(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function public.release_text_reserve(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_text_usage(uuid, text, integer, integer, boolean) to service_role;
grant execute on function public.commit_text_reserve(uuid, uuid, text, integer) to service_role;
grant execute on function public.release_text_reserve(uuid, uuid) to service_role;
