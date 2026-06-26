-- ─────────────────────────────────────────────────────────────────────────
-- ЛОГИКА ЭНЕРГИИ (Часть 1, серверная сторона). Применяется на прод.
-- Содержит:
--   1) consume_energy() — АТОМАРНОЕ списание с блокировкой строки кошелька
--      (защита от гонок и ухода в минус).
--   2) handle_new_user() + триггер — при регистрации заводит тариф «Старт»(free)
--      и кошелёк. ЗАЩИЩЁННЫЙ: любая ошибка проглатывается, регистрацию НЕ роняет.
--   3) Разовый «добор» для уже существующих пользователей (тариф + кошелёк).
-- Энергия по тарифу СГОРАЕТ помесячно (Вариант A): пополнение делает баланс
-- равным месячной норме (логика пополнения — в lib/energy.ts).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Атомарное списание энергии.
create or replace function public.consume_energy(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_operation text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_new integer;
begin
  -- блокируем строку кошелька на время операции (защита от двойного списания)
  select balance into v_balance
    from public.energy_wallet
   where user_id = p_user_id
   for update;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'no_wallet', 'balance', 0);
  end if;

  if p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount', 'balance', v_balance);
  end if;

  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance);
  end if;

  v_new := v_balance - p_amount;

  update public.energy_wallet
     set balance = v_new,
         total_spent = total_spent + p_amount,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.energy_transactions (user_id, amount, reason, operation, balance_after)
    values (p_user_id, -p_amount, p_reason, p_operation, v_new);

  return jsonb_build_object('ok', true, 'balance', v_new);
end;
$$;

-- 2) Заведение тарифа + кошелька при регистрации (ЗАЩИЩЁННЫЙ триггер).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
begin
  begin
    select * into v_plan from public.plans where code = 'free' limit 1;

    if v_plan.id is not null then
      insert into public.user_subscription (user_id, plan_id, period_start, period_end)
        values (new.id, v_plan.id, now(), null)
        on conflict (user_id) do nothing;

      insert into public.energy_wallet (user_id, balance, monthly_allowance, next_refill)
        values (new.id,
                coalesce(v_plan.energy_per_month, 0),
                coalesce(v_plan.energy_per_month, 0),
                now() + interval '1 month')
        on conflict (user_id) do nothing;
    end if;
  exception when others then
    -- КРИТИЧНО: регистрацию не роняем ни при каких условиях.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Разовый «добор» для уже существующих пользователей.
-- Подписка Free тем, у кого её нет:
insert into public.user_subscription (user_id, plan_id, period_start)
select u.id, p.id, now()
from auth.users u
cross join (select id from public.plans where code = 'free' limit 1) p
where not exists (
  select 1 from public.user_subscription s where s.user_id = u.id
)
on conflict (user_id) do nothing;

-- Кошелёк тем, у кого его нет:
insert into public.energy_wallet (user_id, balance, monthly_allowance, next_refill)
select u.id,
       coalesce(p.energy_per_month, 0),
       coalesce(p.energy_per_month, 0),
       now() + interval '1 month'
from auth.users u
cross join (select energy_per_month from public.plans where code = 'free' limit 1) p
where not exists (
  select 1 from public.energy_wallet w where w.user_id = u.id
)
on conflict (user_id) do nothing;
