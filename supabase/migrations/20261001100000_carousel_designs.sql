-- Карусели, этап 2а: шаблонное оформление (_знания/мозг-генератора/07-KARUSELI-TZ.md, раздел 5).
-- Применяет Арина в Supabase. Пишет в таблицу только сервер (service role), владелец читает свое.

-- ── Оформление карусели: одно на материал ──
CREATE TABLE IF NOT EXISTS public.carousel_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.generated_posts(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'template' CHECK (kind IN ('template', 'generated')),
  style text NOT NULL,
  colors jsonb,
  variant smallint NOT NULL DEFAULT 0,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text NOT NULL DEFAULT '',
  source_text text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'generating', 'ready', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id)
);
CREATE INDEX IF NOT EXISTS carousel_designs_user_idx ON public.carousel_designs (user_id, updated_at DESC);

ALTER TABLE public.carousel_designs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own carousel designs" ON public.carousel_designs;
CREATE POLICY "Users can view own carousel designs" ON public.carousel_designs
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.carousel_designs IS 'Оформление карусели: стиль, акцент, раскладка П7 с правками психолога. Одна запись на материал.';
COMMENT ON COLUMN public.carousel_designs.colors IS 'Свои цвета психолога {bg, text, accent} поверх цветов стиля; null значит цвета стиля.';
COMMENT ON COLUMN public.carousel_designs.layout IS 'Слайды [{n, role, big, small, accent, photo}] после проверки кодом.';
COMMENT ON COLUMN public.carousel_designs.source_text IS 'Текст карусели, по которому сделана раскладка: если текст поменялся, фронт предлагает разложить заново.';

-- ── Профиль: что нужно шаблонам ──
ALTER TABLE public.onboarding_profiles
  ADD COLUMN IF NOT EXISTS carousel_palette jsonb,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS carousel_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.onboarding_profiles.carousel_palette IS 'Ее цвета каруселей {bg, text, accent}: переходят в новые карусели. null значит цвета стиля.';
COMMENT ON COLUMN public.onboarding_profiles.instagram_handle IS 'Ник без @, печатается на слайдах.';
COMMENT ON COLUMN public.onboarding_profiles.avatar_path IS 'Путь аватара в бакете user-photos (для стиля «Записка»).';
COMMENT ON COLUMN public.onboarding_profiles.carousel_photos IS 'Пути фото в бакете user-photos для «Премиум» и «Скрапбук», по порядку.';

-- ── Хранилище фото психолога: приватно, путь user_id/... ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own photos" ON storage.objects;
CREATE POLICY "Users can view own photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
