-- Одна мысль в несколько форматов и «Сделать так же» (задача sdelat-i-brend, раздел 4 «Хранение»).
-- НЕ ПРИМЕНЕНА. Применяет Арина после своего «да».
-- Старую колонку source (text, default 'generator', значения generator и content-plan) не трогаем:
-- источник «Сделать так же» живет в отдельной sample_source.
-- Пока ее нет, код работает без этих колонок: запись материала идет без group_id, core и sample_source,
-- старые материалы (и новые до применения) показываются группами из одного.
-- Денег и энергии не касается. RLS у generated_posts уже есть (по user_id), здесь не трогаем.

alter table public.generated_posts
  add column if not exists group_id uuid,
  add column if not exists core jsonb,
  add column if not exists sample_source jsonb,
  add column if not exists published_at timestamptz;

comment on column public.generated_posts.group_id is 'Общий id у форматов одного запуска «одна мысль в несколько форматов». null у старых материалов, они показываются группой из одного.';
comment on column public.generated_posts.core is 'Ядро мысли: {thought, who, scene, mechanism, others_say, distinction, step, quote, intent, author_detail, flags}. Хранится у каждого материала группы, чтобы «Сделать еще формат» брал ядро по id любого из них. null у старых материалов.';
comment on column public.generated_posts.sample_source is 'Источник для «Сделать так же»: тип источника и абстрактный скелет приема. Чужой текст сюда не пишется. null значит материал сделан не по образцу.';
comment on column public.generated_posts.published_at is 'Когда психолог отметила материал опубликованным. null: сделан, но не отмечен.';

-- Выбрать все форматы одной мысли у автора
create index if not exists generated_posts_user_group_idx
  on public.generated_posts (user_id, group_id)
  where group_id is not null;
