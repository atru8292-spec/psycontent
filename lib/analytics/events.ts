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
  onb_step_view: ['step'],                           // показали вопрос 1-5
  onb_step_done: ['step', 'ms'],                     // ответила и пошла дальше, ms на шаге
  onb_skip: ['step'],                                // пропустила необязательный (5)
  onb_situation_change: ['index'],                   // «Другая ситуация» на 4-м вопросе
  onb_mic_denied: [],                                // браузер не дал микрофон
  onb_done: [],                                      // профиль сохранен
  onb_first_click: [],                               // «Сделать пост и карусель» на финале

  // ---- создание (сервер) ----
  make_start: ['formats', 'mode', 'voice', 'n'],     // запуск: коды форматов через запятую, mode thought|same|topic|draft
  make_done: ['formats', 'ms', 'n_ok'],              // готово: сколько форматов получилось
  make_error: ['code', 'format'],                    // код ошибки, который отдается на экран

  // ---- взяла текст в работу (главный сигнал ценности) ----
  material_take: ['how', 'format', 'post'],          // how copy|copy_caption|copy_text|share|zip|single|list|published, post = id материала
  material_adjust: ['action', 'format'],             // «Поправить», «Другой заход», «Еще формат» (сервер, /api/generate-post/adjust и group)

  // ---- деньги и лимиты ----
  limit_hit: ['reason', 'plan', 'op'],               // сервер: canConsume отказал (lib/energy.ts)
  paywall_view: ['where'],                           // клиент: показан LimitNotice или блок тарифов
  plan_click: ['plan'],                              // клиент: нажала на тариф

  // ---- ошибки и функции ----
  error_shown: ['code', 'screen'],                   // клиент: показана плашка ошибки
  feature_open: ['feature'],                         // клиент: открыта функция из FEATURES

  // ---- лендинг (app/page.tsx): единственные события, которые сервер принимает без входа ----
  land_view: [],                                     // открыли главную, один раз за загрузку
  land_cta_click: ['place', 'plan'],                 // кнопка в регистрацию: place hero|how|pricing|final|header|demo, plan free|calm|daily
  land_demo_submit: [],                              // оставили мысль в демо (сама мысль в событие не идет)
  land_faq_open: ['q'],                              // открыли вопрос: короткий код вроде q_chatgpt, текст вопроса не идет
} as const satisfies Record<string, readonly string[]>

// События лендинга пишутся и без входа (user_id пустой, только session_id от track)
export const isLandingEvent = (e: string) => e.startsWith('land_')

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
] as const
export type Feature = typeof FEATURES[number]

// Код формата для событий: виды рилсов сводим в reels
export const normFormat = (f: unknown): string => { const c = String(f || ''); return c.startsWith('reels') ? 'reels' : c || 'post' }

// Форматы и режимы, которые кабинет показывает по-русски
export const FORMAT_RU: Record<string, string> = {
  post: 'пост', post_tg: 'Telegram', carousel: 'карусель', stories: 'сторис', reels: 'рилс',
}
export const MODE_RU: Record<string, string> = { thought: 'мысль', same: 'так же', topic: 'тема', draft: 'черновик' }
