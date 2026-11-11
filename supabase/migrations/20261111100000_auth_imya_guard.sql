-- Защита имени в письмах входа (11.11.2026, переезд базы, ветка feat/baza-ru). Применяется на новой базе в РФ,
-- в облаке не применять (облако остается нетронутым запасным вариантом).
-- Письма Supabase Auth пишут «{imya}, привет!» из auth.users.raw_user_meta_data.imya. user_metadata при регистрации
-- задает сам клиент (signUp options.data), поэтому без этой проверки чужой человек мог бы вписать в наше письмо
-- любой текст («Аккаунт заблокирован, напиши на ...») и отправить его на чужую почту с noreply@psycont.ru (ревью 11.11).
-- Правило то же, что в lib/first-name.ts: одно слово из букв, можно дефис и апостроф, до 30 знаков. Подходит:
-- первая буква делается заглавной. Не подходит: ключ imya удаляется, письмо начнется с «Привет!».
-- Функция не SECURITY DEFINER, прав не дает, вызвать ее напрямую нельзя (revoke ниже, как требует CLAUDE.md).
-- Идемпотентно: create or replace и drop trigger if exists.

create or replace function public.psycont_imya_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text;
begin
  if new.raw_user_meta_data ? 'imya' then
    v := btrim(coalesce(new.raw_user_meta_data ->> 'imya', ''));
    if v ~ '^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё''-]{0,29}$' then
      new.raw_user_meta_data := jsonb_set(new.raw_user_meta_data, '{imya}', to_jsonb(upper(left(v, 1)) || substr(v, 2)));
    else
      new.raw_user_meta_data := new.raw_user_meta_data - 'imya';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.psycont_imya_guard() from public, anon, authenticated;

drop trigger if exists psycont_imya_guard on auth.users;
create trigger psycont_imya_guard
  before insert or update of raw_user_meta_data on auth.users
  for each row execute function public.psycont_imya_guard();
