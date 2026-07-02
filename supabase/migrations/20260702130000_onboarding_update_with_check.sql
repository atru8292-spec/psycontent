-- Безопасность: update-политика onboarding_profiles была без WITH CHECK.
-- Без него Postgres проверяет только СТАРУЮ строку (USING), и владелец мог бы
-- при update переписать user_id на чужой. Добавляем WITH CHECK, чтобы новая
-- строка тоже проходила проверку владельца. Пересоздаем политику (drop + create).
drop policy if exists "Users can update own profile" on public.onboarding_profiles;
create policy "Users can update own profile" on public.onboarding_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
