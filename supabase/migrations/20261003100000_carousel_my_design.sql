-- «Мое оформление» каруселей и тонкие настройки вида (задача karuseli-dvizhok, разделы 5 и 6).
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да». Пока ее нет, код работает на значениях по умолчанию:
-- шрифт стиля, без рубрики и маркера, без «моего оформления» (кнопки шрифта и вида спрятаны, сохранить «мое» нельзя).
-- Только настройки внешнего вида, денег и энергии не касается. RLS у обеих таблиц уже есть (по user_id).

-- В карусели: шрифтовая пара стиля 0..2 и настройки вида (вид акцента, крупные номера, рубрика, фото на обложке).
alter table public.carousel_designs
  add column if not exists font_pair smallint not null default 0,
  add column if not exists options jsonb not null default '{}'::jsonb;

comment on column public.carousel_designs.font_pair is 'Шрифтовая пара стиля 0..2 (lib/carousel/pairs.ts). 0 это шрифты стиля.';
-- Как узнаем, что слайды забирают: сколько раз сохранили и как (share в Фото, zip, по одному)
alter table public.carousel_designs
  add column if not exists export_count integer not null default 0,
  add column if not exists exported_at timestamptz,
  add column if not exists export_method text;

comment on column public.carousel_designs.export_count is 'Сколько раз сохранили слайды (кнопки «Сохранить в Фото», «Скачать все», «Скачать только этот»).';
comment on column public.carousel_designs.export_method is 'Последний способ: share | zip | single | list (подсказка «зажми слайд»).';
comment on column public.carousel_designs.options is 'Вид поверх стиля: {accentKind: color|marker|underline, bigNumbers, rubric, coverPhoto}. Неизвестные ключи код отбрасывает.';

-- В профиле: имя и строка о себе на слайдах, и само «мое оформление» одним объектом.
-- Ник (instagram_handle), аватар (avatar_path), фото (carousel_photos), цвета (carousel_palette) и узор (carousel_decor) уже есть.
alter table public.onboarding_profiles
  add column if not exists carousel_name text,
  add column if not exists carousel_about text,
  add column if not exists carousel_my_design jsonb;

comment on column public.onboarding_profiles.carousel_name is 'Имя на обложке и в финале карусели. null значит full_name.';
comment on column public.onboarding_profiles.carousel_about is 'Строка о себе в финале «кто я». null значит собрать из one_niche.';
comment on column public.onboarding_profiles.carousel_my_design is 'Мое оформление: {style, colors, variant, decor, fontPair, options}. null значит еще не выбрано, новая карусель начинается с выбора стиля.';
