// Яндекс Метрика (задача 17.11, счетчик 114287691; цели и исключения настроены в интерфейсе Метрики, тут их не создаем).
// Правила:
// - Метрика грузится ТОЛЬКО после «Принять» в баннере cookie (components/site/CookieBanner.tsx). Отказ запоминается
//   в localStorage psy_cookie=no, тогда скрипт не грузится нигде и цели не уходят.
// - Нет Метрики в /admin, /api, /dev: скрипт там не грузится; если человек перешел туда без перезагрузки, а скрипт
//   уже работает, страница перезагружается без него (иначе Вебвизор записал бы кабинет админа с почтами).
// - Сайт без перезагрузок (Next.js): первый хит шлет init, дальше хит на каждую смену адреса (способ «SPA»).
// - Цели только с идентификаторами из GOALS. В параметрах целей нет текстов, имен, почт и id: только коды UTM.
// - Поля почты и пароля скрыты от Вебвизора классами PRIVATE_FIELD.
// - Вне psycont.ru (локальная сборка, превью) Метрика не грузится, кроме проверки: localStorage psy_metrika_dev=1.

export const METRIKA_ID = 114287691
export const CONSENT_KEY = 'psy_cookie' // yes | no
const LAND_URL_KEY = 'psy_land_url'      // адрес первого входа с UTM (sessionStorage), чтобы метки дошли до Метрики

// Цели в Метрике: «Целевое событие, идентификатор содержит». Только эти идентификаторы.
export const GOALS = [
  'land_cta', 'land_signup_open', 'signup_submit', 'signup_done', 'login_yandex',
  'onb_step_1', 'onb_step_2', 'onb_step_3', 'onb_step_4', 'onb_step_5', 'onb_done',
  'make_first_click', 'first_material', 'first_copy',
  'paywall_view', 'plan_click', 'pay_success',
] as const
export type Goal = typeof GOALS[number]
const isGoal = (g: string): g is Goal => (GOALS as readonly string[]).includes(g)

// Классы Вебвизора: содержимое поля в записи заменяется звездочками, нажатия клавиш не пишутся
export const PRIVATE_FIELD = 'ym-hide-content ym-disable-keys'

const BLOCKED = ['/admin', '/api', '/dev']
export const metrikaPathAllowed = (p: string) => !BLOCKED.some(b => p === b || p.startsWith(b + '/'))

type Consent = 'yes' | 'no' | null
export function getConsent(): Consent {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'yes' || v === 'no' ? v : null } catch { return null }
}
export function setConsent(v: 'yes' | 'no') {
  try { localStorage.setItem(CONSENT_KEY, v) } catch {}
}

function hostAllowed(): boolean {
  try {
    if (location.hostname === 'psycont.ru' || location.hostname === 'www.psycont.ru') return true
    return localStorage.getItem('psy_metrika_dev') === '1'
  } catch { return false }
}

let loaded = false
let lastUrl = ''
export const metrikaLoaded = () => loaded

// Запоминаем адрес входа с UTM до согласия: если человек нажмет «Принять» на другой странице, метки не потеряются
export function rememberLandingUrl() {
  try {
    if (sessionStorage.getItem(LAND_URL_KEY)) return
    if (/[?&](utm_[a-z]+|yclid|gclid)=/i.test(location.search)) sessionStorage.setItem(LAND_URL_KEY, JSON.stringify({ url: location.href, ref: document.referrer }))
  } catch {}
}

export function loadMetrika(): boolean {
  if (loaded) return true
  if (typeof window === 'undefined' || getConsent() !== 'yes' || !hostAllowed() || !metrikaPathAllowed(location.pathname)) return false
  const w = window as any
  // стандартная заглушка Метрики: вызовы копятся в очереди, пока грузится tag.js
  w.ym = w.ym || function (...args: unknown[]) { (w.ym.a = w.ym.a || []).push(args) }
  w.ym.l = Date.now()
  const src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`
  if (!document.querySelector(`script[src="${src}"]`)) {
    const s = document.createElement('script')
    s.async = true
    s.src = src
    document.head.appendChild(s)
  }
  // Согласие дали не на странице входа с UTM (ушла дальше, потом нажала «Принять»): первым хитом идет адрес входа
  // с метками (визит и источник считаются верно), вторым текущая страница
  let saved: { url?: string; ref?: string } | null = null
  try { saved = JSON.parse(sessionStorage.getItem(LAND_URL_KEY) || 'null') } catch {}
  const first = saved?.url && saved.url !== location.href ? saved.url : location.href
  w.ym(METRIKA_ID, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: first === location.href ? document.referrer : saved?.ref || '', url: first, accurateTrackBounce: true, trackLinks: true,
  })
  if (first !== location.href) w.ym(METRIKA_ID, 'hit', location.href, { referer: first })
  try { sessionStorage.removeItem(LAND_URL_KEY) } catch {}
  loaded = true
  lastUrl = location.href
  if (location.pathname.startsWith('/dashboard')) prepareFirsts()
  return true
}

// Хит при смене адреса без перезагрузки. На закрытом пути с уже загруженной Метрикой перезагружаем страницу без нее.
export function metrikaRoute() {
  if (typeof window === 'undefined') return
  if (!metrikaPathAllowed(location.pathname)) { if (loaded) location.reload(); return }
  if (!loaded) { loadMetrika(); return }
  if (location.href === lastUrl) return
  ;(window as any).ym(METRIKA_ID, 'hit', location.href, { referer: lastUrl })
  lastUrl = location.href
  if (location.pathname.startsWith('/dashboard')) prepareFirsts()
}

// UTM из cookie psy_src (ставит middleware при первом заходе, только коды) для целей регистрации
function utmParams(): Record<string, string> | undefined {
  try {
    const m = document.cookie.match(/(?:^|;\s*)psy_src=([^;]+)/)
    if (!m) return undefined
    const out: Record<string, string> = {}
    for (const part of decodeURIComponent(m[1]).split('|')) {
      const [k, v] = part.split(':')
      if (['src', 'medium', 'campaign'].includes(k) && v && /^[a-z0-9_.-]{1,40}$/i.test(v)) out[k] = v
    }
    return Object.keys(out).length ? out : undefined
  } catch { return undefined }
}

export function goal(id: Goal): void {
  try {
    if (!isGoal(id) || !loaded || !metrikaPathAllowed(location.pathname)) return
    const params = id === 'signup_submit' || id === 'signup_done' || id === 'login_yandex' ? utmParams() : undefined
    ;(window as any).ym(METRIKA_ID, 'reachGoal', id, params)
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== 'production') console.debug('[metrika] goal', id, params || {})
  } catch {}
}

// «Первое» действие: один раз на человека. База говорит, было ли оно раньше (/api/metrika/firsts),
// флаг в localStorage не дает отправить второй раз на этом устройстве.
type FirstKey = 'make' | 'material' | 'copy'
const FIRST_GOAL: Record<FirstKey, Goal> = { make: 'make_first_click', material: 'first_material', copy: 'first_copy' }
let firsts: Promise<Record<FirstKey, boolean> | null> | null = null
function loadFirsts() {
  if (!firsts) firsts = fetch('/api/metrika/firsts', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  return firsts
}
// Вызывать при открытии экрана «Сделать»: ответ базы нужен до действия, после него база уже знает о нем
export function prepareFirsts() { if (loaded) void loadFirsts() }
export async function goalFirst(k: FirstKey): Promise<void> {
  try {
    if (!loaded) return
    const flag = `psy_g_${k}`
    if (localStorage.getItem(flag) === '1') return
    const had = await loadFirsts()
    if (!had) return            // база не ответила: лучше пропустить цель, чем отправить ее повторно
    localStorage.setItem(flag, '1')
    if (had[k]) return          // уже было до этого устройства
    goal(FIRST_GOAL[k])
  } catch {}
}

// Цели, которые совпадают с событиями внутренней аналитики: track() зовет это сам, логика не дублируется
export function goalsFromTrack(event: string, props?: Record<string, string | number | boolean>) {
  if (!loaded) return
  switch (event) {
    case 'land_cta_click':
      goal('land_cta')
      if (props?.place === 'pricing') goal('plan_click')
      break
    case 'onb_step_done': {
      const n = Number(props?.step)
      if (n >= 1 && n <= 5) goal(`onb_step_${n}` as Goal)
      break
    }
    case 'onb_skip': if (Number(props?.step) === 5) goal('onb_step_5'); break // пятый вопрос необязательный: пропуск тоже пройденный шаг
    case 'onb_done': goal('onb_done'); break
    case 'paywall_view': goal('paywall_view'); break
    case 'plan_click': goal('plan_click'); break
    case 'auth_link_ok': if (props?.kind === 'signup') goal('signup_done'); break
    case 'material_take': if (String(props?.how || '').startsWith('copy')) void goalFirst('copy'); break
  }
}

// Цели, которые сервер передал через короткую cookie psy_goal (вход через Яндекс: редирект с сервера)
export function goalsFromCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)psy_goal=([^;]+)/)
    if (!m) return
    document.cookie = 'psy_goal=; Max-Age=0; Path=/; SameSite=Lax'
    for (const g of decodeURIComponent(m[1]).split(',')) if (isGoal(g)) goal(g)
  } catch {}
}
