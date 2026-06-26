-- ─────────────────────────────────────────────────────────────────────────
-- БАЗОВЫЙ СНИМОК RLS-ПОЛИТИК существующих таблиц (snapshot на 25 июня 2026)
-- Часть «чертежа»: восстанавливает защиту «каждый видит только своё».
-- Идемпотентно (drop if exists → create), безопасно запускать повторно.
-- На прод применять НЕ нужно (политики уже есть) — это для восстановления базы.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.onboarding_profiles   enable row level security;
alter table public.onboarding_answers    enable row level security;
alter table public.brand_passports       enable row level security;
alter table public.brand_passport_drafts enable row level security;
alter table public.content_plans         enable row level security;
alter table public.researched_topics     enable row level security;
alter table public.generated_posts       enable row level security;
alter table public.competitor_analyses   enable row level security;
alter table public.user_settings         enable row level security;

-- onboarding_profiles
drop policy if exists "Users can read own profile" on public.onboarding_profiles;
create policy "Users can read own profile" on public.onboarding_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own profile" on public.onboarding_profiles;
create policy "Users can insert own profile" on public.onboarding_profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own profile" on public.onboarding_profiles;
create policy "Users can update own profile" on public.onboarding_profiles
  for update using (auth.uid() = user_id);

-- onboarding_answers
drop policy if exists "Users can read own answers" on public.onboarding_answers;
create policy "Users can read own answers" on public.onboarding_answers
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own answers" on public.onboarding_answers;
create policy "Users can insert own answers" on public.onboarding_answers
  for insert with check (auth.uid() = user_id);

-- brand_passports
drop policy if exists "Users can read own passport" on public.brand_passports;
create policy "Users can read own passport" on public.brand_passports
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own passport" on public.brand_passports;
create policy "Users can insert own passport" on public.brand_passports
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own passport" on public.brand_passports;
create policy "Users can update own passport" on public.brand_passports
  for update using (auth.uid() = user_id);

-- brand_passport_drafts
drop policy if exists "Users manage own drafts" on public.brand_passport_drafts;
create policy "Users manage own drafts" on public.brand_passport_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- content_plans
drop policy if exists "Users can manage their own content plan" on public.content_plans;
create policy "Users can manage their own content plan" on public.content_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- researched_topics
drop policy if exists "Users can manage their own research" on public.researched_topics;
create policy "Users can manage their own research" on public.researched_topics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_posts
drop policy if exists "Users can view own posts" on public.generated_posts;
create policy "Users can view own posts" on public.generated_posts
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own posts" on public.generated_posts;
create policy "Users can insert own posts" on public.generated_posts
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own posts" on public.generated_posts;
create policy "Users can update own posts" on public.generated_posts
  for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own posts" on public.generated_posts;
create policy "Users can delete own posts" on public.generated_posts
  for delete using (auth.uid() = user_id);

-- competitor_analyses
drop policy if exists "Users can view own analyses" on public.competitor_analyses;
create policy "Users can view own analyses" on public.competitor_analyses
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own analyses" on public.competitor_analyses;
create policy "Users can insert own analyses" on public.competitor_analyses
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own analyses" on public.competitor_analyses;
create policy "Users can delete own analyses" on public.competitor_analyses
  for delete using (auth.uid() = user_id);

-- user_settings
drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings" on public.user_settings
  for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings" on public.user_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings" on public.user_settings
  for update using (auth.uid() = user_id);
