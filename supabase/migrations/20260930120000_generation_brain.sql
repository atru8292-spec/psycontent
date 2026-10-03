-- Новый «мозг» генератора (этап 1): данные о голосе психолога и память ленты.
-- Документы: _знания/мозг-генератора/02-ARHITEKTURA.md и 03-PROMPTY.md.
--
-- Все поля необязательные, код работает и без них (умолчания из старых полей).
-- RLS: новые колонки живут в существующих таблицах, их политики (владелец читает и пишет
-- только свою строку) уже покрывают новые поля. Генерация читает и пишет через service_role.
-- Применяет Арина вручную в Supabase.

-- ── onboarding_profiles: голос и настройки автора ──
ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS author_gender text CHECK (author_gender IN ('female', 'male')),
  ADD COLUMN IF NOT EXISTS reader_address text CHECK (reader_address IN ('ty', 'vy', 'vy_devochki')),
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS profanity text CHECK (profanity IN ('no', 'light')),
  ADD COLUMN IF NOT EXISTS disclosure smallint CHECK (disclosure IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS booking_info text,
  ADD COLUMN IF NOT EXISTS first_session_info text,
  ADD COLUMN IF NOT EXISTS position_text text,
  ADD COLUMN IF NOT EXISTS character_text text,
  ADD COLUMN IF NOT EXISTS voice_core text,
  ADD COLUMN IF NOT EXISTS voice_core_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_samples jsonb,
  ADD COLUMN IF NOT EXISTS signature_phrases jsonb,
  ADD COLUMN IF NOT EXISTS story_bank jsonb,
  ADD COLUMN IF NOT EXISTS new_pipeline boolean DEFAULT false;

COMMENT ON COLUMN onboarding_profiles.author_gender IS 'Пол автора для форм глаголов в текстах: female | male. Пусто: угадываем по имени.';
COMMENT ON COLUMN onboarding_profiles.reader_address IS 'Обращение к читателю: ty | vy | vy_devochki. Пусто: по полю appeal и образцам.';
COMMENT ON COLUMN onboarding_profiles.audience IS 'Аудитория одной строкой, например «в основном женщины 30-45».';
COMMENT ON COLUMN onboarding_profiles.profanity IS 'Мат в текстах: no | light (точечно, цензура как у автора).';
COMMENT ON COLUMN onboarding_profiles.disclosure IS 'Самораскрытие: 1 открыто, 2 про работу, 3 только практика.';
COMMENT ON COLUMN onboarding_profiles.booking_info IS 'Как ко мне попасть (для смысла priglashenie).';
COMMENT ON COLUMN onboarding_profiles.first_session_info IS 'Как проходит первая встреча (для priglashenie).';
COMMENT ON COLUMN onboarding_profiles.position_text IS 'С чем спорю, что бесит (для смыслов poziciya, mif).';
COMMENT ON COLUMN onboarding_profiles.character_text IS 'Сквозной персонаж автора (субличность, маскот): кто он и как себя ведет.';
COMMENT ON COLUMN onboarding_profiles.voice_core IS 'Слепок голоса (П0), 2500-4500 символов.';
COMMENT ON COLUMN onboarding_profiles.voice_samples IS 'Образцы текстов: [{text, fit, source}] , fit из пункта 13 слепка.';
COMMENT ON COLUMN onboarding_profiles.signature_phrases IS 'Фирменные обороты из пункта 11 слепка, массив строк.';
COMMENT ON COLUMN onboarding_profiles.story_bank IS 'Банк историй: [{text, level}] , level personal | work | practice.';
COMMENT ON COLUMN onboarding_profiles.new_pipeline IS 'Новая цепочка генерации для этого пользователя (работает при NEW_GENERATION_PIPELINE=on).';

-- ── generated_posts: что было в материале (память ленты) и результат проверки ──
ALTER TABLE generated_posts
  ADD COLUMN IF NOT EXISTS format_code text,
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS hook_type text,
  ADD COLUMN IF NOT EXISTS arc text,
  ADD COLUMN IF NOT EXISTS ending_type text,
  ADD COLUMN IF NOT EXISTS ring boolean,
  ADD COLUMN IF NOT EXISTS opening text,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS client_phrase_used text,
  ADD COLUMN IF NOT EXISTS signatures_used jsonb,
  ADD COLUMN IF NOT EXISTS topic_for_text text,
  ADD COLUMN IF NOT EXISTS plan jsonb,
  ADD COLUMN IF NOT EXISTS check_result jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version text,
  ADD COLUMN IF NOT EXISTS pipeline_status text CHECK (pipeline_status IN ('checking', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS draft_content text,
  ADD COLUMN IF NOT EXISTS feedback jsonb;

COMMENT ON COLUMN generated_posts.plan IS 'План П1 целиком (новая цепочка).';
COMMENT ON COLUMN generated_posts.check_result IS 'Проверка П4, число правок, был ли повторный П2.';
COMMENT ON COLUMN generated_posts.pipeline_status IS 'checking: текст показан, проверка идет фоном; ready: итог; error: фон упал, остался черновик.';
COMMENT ON COLUMN generated_posts.draft_content IS 'Текст до проверки и правки (для сравнения).';
COMMENT ON COLUMN generated_posts.feedback IS 'Реакция психолога: {verdict, reasons[]} , причины «Не похоже на меня» идут в память.';

-- ── Обучение голосу (08-GOLOS-I-OBUCHENIE.md) ──
ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS voice_core_prev text,
  ADD COLUMN IF NOT EXISTS voice_summary text,
  ADD COLUMN IF NOT EXISTS voice_change_line text,
  ADD COLUMN IF NOT EXISTS voice_corrections text,
  ADD COLUMN IF NOT EXISTS habits jsonb,
  ADD COLUMN IF NOT EXISTS tg_channel text;

COMMENT ON COLUMN onboarding_profiles.voice_core_prev IS 'Прошлый слепок голоса: для отката, если после пересборки посты стали хуже.';
COMMENT ON COLUMN onboarding_profiles.voice_summary IS 'Как я тебя слышу: 2-4 строки для психолога (П0б).';
COMMENT ON COLUMN onboarding_profiles.voice_change_line IS 'Что изменилось при последней пересборке голоса, одна строка для экрана.';
COMMENT ON COLUMN onboarding_profiles.voice_corrections IS 'Что психолог сказала про свой голос на «Не совсем». Идет в слепок.';
COMMENT ON COLUMN onboarding_profiles.habits IS 'Привычки по кнопкам: {"короче": 4, "теплее": 1}. Влияют на план.';
COMMENT ON COLUMN onboarding_profiles.tg_channel IS 'Открытый телеграм-канал психолога, из него берем посты как образцы.';

-- События, из которых сервис учится голосу. Пишет только сервер (service_role).
-- kind: edit_pair (правка перед копированием, before/after), copied_clean (скопировала без правок),
-- mine, not_like (реакции, причины в data.reasons), button (кнопка «Поправить», data.button),
-- hook_pick (выбрала другой заход), rephrase (сказала фразу по-своему, before/after),
-- repeat_phrases (что повторяет клиентам), speech (надиктованный текст), rewrite_input (свой текст в рерайте),
-- pasted_post (вставила свой пост), tg_post (пост из ее телеграм-канала), voice_feedback (Похоже / Не совсем).
CREATE TABLE IF NOT EXISTS public.voice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.generated_posts(id) ON DELETE SET NULL,
  kind text NOT NULL,
  before_text text,
  after_text text,
  data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_events_user_created ON public.voice_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_events_user_kind ON public.voice_events (user_id, kind);

ALTER TABLE public.voice_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own voice events" ON public.voice_events;
CREATE POLICY "Users can view own voice events" ON public.voice_events
  FOR SELECT USING (auth.uid() = user_id);
-- insert/update/delete только сервером: политик на запись нет намеренно.

-- Учимся или портимся: по каждому психологу за неделю.
-- security_invoker: пользователь через API видит только свои строки (RLS voice_events).
CREATE OR REPLACE VIEW public.voice_learning_stats WITH (security_invoker = true) AS
SELECT
  user_id,
  date_trunc('week', created_at) AS week,
  count(*) FILTER (WHERE kind = 'copied_clean') AS copied_clean,
  count(*) FILTER (WHERE kind = 'edit_pair') AS edited,
  round(avg((data->>'change_ratio')::numeric) FILTER (WHERE kind = 'edit_pair'), 3) AS avg_change_ratio,
  count(*) FILTER (WHERE kind = 'not_like') AS not_like,
  count(*) FILTER (WHERE kind = 'mine') AS mine
FROM public.voice_events
GROUP BY user_id, date_trunc('week', created_at);

-- ── «Опубликовала» на экране «Сделать» (09-PUT-POLZOVATELYA.md) ──
ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS published_at timestamptz;
COMMENT ON COLUMN generated_posts.published_at IS 'Когда психолог отметила материал опубликованным. null: сделан, но не отмечен.';
