// Единая точка для замеров (задача onbording, раздел 4). Аналитики пока нет: следующей задачей будет своя
// таблица событий в Supabase по user_id и админ-кабинет. Сейчас track в dev пишет в console.debug,
// в проде ничего не делает. Сторонних счетчиков не подключать (152-ФЗ).
//
// События онбординга:
//   onb_intro          показали карточку входа с Верой
//   onb_step_view      показали вопрос            props: step (1-5)
//   onb_step_done      ответила и пошла дальше     props: step (1-5), ms (время на шаге)
//   onb_skip           пропустила необязательный  props: step (сейчас только 5; onb_step_done для него не пишется)
//   onb_situation_change  нажала «Другая ситуация» на шаге 4  props: index (номер реплики 0-3)
//   onb_mic_denied     браузер не дал микрофон (шаг 4)
//   onb_done           профиль сохранен, показан финал
//   onb_first_click    нажала «Сделать пост и карусель» на финале

export type TrackProps = Record<string, string | number | boolean>

export function track(event: string, props?: TrackProps): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[track]', event, props || {})
  }
}
