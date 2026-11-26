// Список разрешенных событий аналитики (задача _знания/PROMPT-CLAUDE-CODE-analitika.md, этап 2).
// Один список на клиент, сервер (/api/ev, serverTrack) и кабинет. Событие не из списка молча отбрасывается.
// У каждого события свои разрешенные ключи props: санитайзер (sanitize.ts) пропускает только их, а значения
// только числа, true/false и короткие коды [a-z0-9_,.:-] до 40 знаков. Текстов постов, тем, мыслей, имен,
// ссылок, IP и user-agent в событиях нет и быть не может.
//
// Правило: каждая новая кнопка или экран получает свое событие здесь (CLAUDE.md, «АНАЛИТИКА И КАБИНЕТ»).
// Что база уже знает, второй раз не пишем: готовые материалы (generated_posts), «Опубликовала»
// (generated_posts.published_at), траты (usage_log), сигналы голоса (voice_events), экспорт карусели
// (carousel_designs.export_count, exported_at, export_method). Кабинет читает их напрямую.

export const EVENTS = {
  // ---- визиты ----
  app_open: ['device', 'standalone', 'ref'],        // клиент: новая сессия (30 минут тишины). device mobile|desktop, ref internal|direct|other
  screen_view: ['screen'],                           // клиент: смена экрана, короткое имя из SCREENS
  signup_source: ['src', 'medium', 'campaign', 'ref'], // клиент: один раз на человека, из cookie psy_src

  // ---- онбординг (app/onboarding/express) ----
  onb_intro: [],                                     // показали вход с Верой
  onb_step_view: ['step'],                           // показали вопрос 1-6 (анкета 2 с 19.11; до нее 5 вопросов)
  onb_step_done: ['step', 'ms'],                     // ответила и пошла дальше, ms на шаге
  onb_skip: ['step'],                                // пропустила необязательный (4 или 5); пропуск пишет и onb_step_done
  onb_situation_change: ['index'],                   // «Другая ситуация» на 6-м вопросе
  onb_mic_denied: [],                                // браузер не дал микрофон
  onb_done: [],                                      // профиль сохранен
  onb_first_click: [],                               // «Сделать пост и карусель» на финале

  // ---- создание (сервер) ----
  make_start: ['formats', 'mode', 'voice', 'n', 'format_kod'], // запуск: коды форматов через запятую, mode thought|same|topic|draft; format_kod код каталога zh6 (из плана или выбран вручную)
  make_done: ['formats', 'ms', 'n_ok'],              // готово: сколько форматов получилось
  make_error: ['code', 'format'],                    // код ошибки, который отдается на экран

  // ---- взяла текст в работу (главный сигнал ценности) ----
  material_take: ['how', 'format', 'post'],          // how copy|copy_caption|copy_text|share|zip|single|list|published, post = id материала
  material_adjust: ['action', 'format', 'post'],     // «Поправить», «Другой заход», «Еще формат» (сервер, /api/generate-post/adjust и group); post = id материала (с 24.10, для правок по тексту во вкладке «Тексты»)
  make_next_topic: [],                               // клиент: «Следующая тема» после копирования на результате zh13
  trial_spend_confirm: ['answer'],                   // клиент: ответ на «Потратить 1 пробный текст?» перед другим форматом (yes|no)
  limit_wait: ['plan'],                              // клиент: «Подожду до ...» на карточке «Тексты закончились» (plan start|practice)

  // ---- деньги и лимиты ----
  limit_hit: ['reason', 'plan', 'op'],               // сервер: canConsume отказал (lib/energy.ts)
  paywall_view: ['where'],                           // клиент: показан LimitNotice или блок тарифов
  account_delete: ['reason', 'days', 'materials'],  // сервер: человек удалил аккаунт сам (без user_id: аккаунт и его строки стерты). reason коды чипов через запятую
  plan_click: ['plan', 'where'],                     // клиент: нажала на тариф (where: tariffs, settings_trial, settings_zero, settings_renew, settings_ended, pay_screen)
  pay_start: ['plan', 'auto', 'via'],                // сервер: человек ушел на страницу ЮKassa (via sbp|any, auto согласие на автопродление)
  pay_done: ['plan', 'kind', 'via'],                 // сервер: платеж подтвержден API ЮKassa (kind first|renewal)
  pay_failed: ['kind', 'reason'],                    // сервер: платеж отменен (код причины ЮKassa)
  pay_autorenew_off: [],                             // сервер: человек выключил автопродление
  pay_mail: ['kind'],                                // сервер: ушло письмо ручного продления (end_soon|end_today|ended)
  pay_plan_change: ['plan', 'cancel'],               // сервер: смена тарифа со следующего списания (cancel: вернулась к текущему)
  pay_method_delete: [],                             // сервер: человек удалил способ оплаты

  // ---- вход по ссылкам из писем (app/auth/podtverdit, app/auth/novyy-parol) ----
  // Пишутся только после того, как ссылка дала сессию: без входа /api/ev их не принимает.
  // Запрос ссылки и протухшую ссылку не пишем (человек в этот момент не вошел), почта в события не идет.
  auth_link_ok: ['kind'],                            // ссылка из письма сработала: kind signup|email_change|magiclink|recovery
  auth_reset_done: [],                               // сохранила новый пароль

  // ---- ошибки и функции ----
  error_shown: ['code', 'screen'],                   // клиент: показана плашка ошибки
  feature_open: ['feature'],                         // клиент: открыта функция из FEATURES

  // ---- экран «Помощь» (/dashboard/pomosch) ----
  help_tg_click: ['with_label'],                     // клиент: нажала «Написать в Telegram»; with_label true, если в ссылке была метка аккаунта
  help_faq_open: ['q'],                              // клиент: раскрыла вопрос; q короткий код из lib/help-faq.ts, текст вопроса не идет

  // ---- опрос при уходе (аналитика 2, lib/analytics/exit-survey.ts); свои слова человека сюда не попадают никогда ----
  exit_survey_shown: ['place'],                      // сервер: карточку решили показать (place cooling|delete|cancel)
  exit_survey_open: ['place'],                       // клиент: раскрыла карточку («Рассказать»)
  exit_survey_sent: ['place', 'reasons', 'own', 'contact'], // сервер: ответ записан; reasons коды через запятую, own true|false (написала ли свои слова)
  exit_survey_dismiss: ['place'],                    // клиент: «Не сейчас» или крестик

  // ---- лендинг (app/page.tsx): единственные события, которые сервер принимает без входа ----
  land_view: [],                                     // открыли главную, один раз за загрузку
  land_cta_click: ['place', 'plan'],                 // кнопка в регистрацию: place hero|how|pricing|final|header, plan free|calm|daily
  land_demo_submit: [],                              // оставили мысль в демо (сама мысль в событие не идет); демо пока снято со страницы
  land_faq_open: ['q'],                              // открыли вопрос: короткий код вроде q_chatgpt, текст вопроса не идет
  land_more_open: ['place'],                         // раскрыли свернутый текст: place compare_gpt|compare_ours|ex_yulia|ex_mihail|ex_olga
  land_doc_view: ['doc'],                            // открыли документ: doc offer|privacy|soglasie
  land_cookie_ok: [],                                // нажали «Принять» в плашке про cookie (Яндекс Метрика)
  land_cookie_no: [],                                // нажали «Отказаться» в плашке про cookie
} as const satisfies Record<string, readonly string[]>

// События лендинга пишутся и без входа (user_id пустой, только session_id от track)
export const isLandingEvent = (e: string) => e.startsWith('land_')
// События, которые пишет только сервер (serverTrack): из браузера через /api/ev не принимаются, иначе человек
// мог бы подделать свои счетчики «показали» и «ответили» в опросе
export const SERVER_ONLY = new Set(['exit_survey_shown', 'exit_survey_sent'])

export type EventName = keyof typeof EVENTS
export const EVENT_NAMES = Object.keys(EVENTS) as EventName[]
export const isEventName = (e: unknown): e is EventName => typeof e === 'string' && Object.prototype.hasOwnProperty.call(EVENTS, e)

// Короткие имена экранов для screen_view: путь -> имя. Порядок важен, первое совпадение по префиксу.
export const SCREENS: [string, string][] = [
  ['/dashboard/make', 'make'],
  ['/dashboard/post-generator', 'make'],
  ['/dashboard/content-plan', 'themes'],
  ['/dashboard/research', 'themes'],
  ['/dashboard/post-history', 'texts'],
  ['/dashboard/settings', 'profile'],
  ['/dashboard/voice', 'voice'],
  ['/dashboard/edit-profile', 'edit_profile'],
  ['/dashboard/brand-passport', 'passport'],
  ['/dashboard/carousel-generator', 'old_carousel'],
  ['/dashboard/reels', 'old_reels'],
  ['/dashboard/hooks-generator', 'old_hooks'],
  ['/dashboard/rewrite', 'old_rewrite'],
  ['/dashboard/competitor-analysis', 'old_competitor'],
  ['/dashboard', 'home'],
  ['/onboarding/express', 'onboarding'],
  ['/onboarding/archetype', 'archetype_test'],
  ['/onboarding', 'onboarding_full'],
]
export function screenOf(pathname: string): string {
  const hit = SCREENS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))
  return hit ? hit[1] : 'other'
}

// Функции для feature_open: экраны и режимы, про которые неясно, живые ли они
export const FEATURES = [
  'ideas',            // «Темы», вкладка «Идеи»
  'plan',             // «Темы», вкладка «План»
  'voice',            // экран голоса
  'sozhe',            // «Сделать так же» (вставила ссылку или скрин)
  'texts',            // «Мои тексты»
  'carousel_design',  // оформление карусели
  'archetype_test',   // тест-архетип
  'passport',         // бренд-паспорт
  'format_pick',      // zh6: открыла выбор формата каталога внутри чипа на «Сделать»
  'help',             // экран «Помощь» (/dashboard/pomosch)
  'add_home',         // раскрыла подсказку «PsyCont на экран Домой» в «Настройках»
] as const
export type Feature = typeof FEATURES[number]

// Код формата для событий: виды рилсов сводим в reels
export const normFormat = (f: unknown): string => { const c = String(f || ''); return c.startsWith('reels') ? 'reels' : c || 'post' }

// Форматы и режимы, которые кабинет показывает по-русски
export const FORMAT_RU: Record<string, string> = {
  post: 'пост', post_tg: 'Telegram', carousel: 'карусель', stories: 'сторис', reels: 'рилс',
}
export const MODE_RU: Record<string, string> = { thought: 'мысль', same: 'так же', topic: 'тема', draft: 'черновик' }
