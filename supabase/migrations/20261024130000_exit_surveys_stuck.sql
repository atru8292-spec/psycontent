-- Опрос «Где застряла?» (аналитика 2, 24.10.2026). ПРИМЕНЕНА 22.10 вручную.
-- Тем, кто зарегистрировался 3+ дня назад и ни разу не взял текст, один раз карточка с вопросом. Ответы в той же
-- таблице exit_surveys с place = 'stuck'; меняется только список разрешенных мест (check), остальное как было.

alter table public.exit_surveys drop constraint if exists exit_surveys_place_check;
alter table public.exit_surveys add constraint exit_surveys_place_check check (place in ('delete', 'cooling', 'cancel', 'stuck'));
