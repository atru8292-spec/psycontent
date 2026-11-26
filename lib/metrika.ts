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
  'onb_step_1', 'onb_step_2', 'onb_step_3', 'onb_step_4', 'onb_step_5', 'onb_step_6', 'onb_done',
  'make_first_click', 'first_material', 'first_copy',
  'paywall_view', 'plan_click', 'pay_success',
] as const
export type Goal = typeof GOALS[number]
const isGoal = (g: string): g is Goal => (GOALS as readonly string[]).includes(g)

// Классы Вебвизора: содержимое поля в записи заменяется звездочками, нажатия клавиш не пишутся
export const PRIVATE_FIELD = 'ym-hide-content ym-disable-keys'

// /auth: страницы из писем входа, в адресе одноразовые токены (ревью 17.11); скрипт там не грузится вовсе
const BLOCKED = ['/admin', '/api', '/dev', '/auth']
export const metrikaPathAllowed = (p: string) => !BLOCKED.some(b => p === b || p.startsWith(b + '/'))

type Consent = 'yes' | 'no' | null
export function getConsent(): Consent {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'yes' || v === 'no' ? v : null } catch { return null }
}
export function setConsent(v: 'yes' | 'no') {
  try { localStorage.setItem(CONSENT_KEY, v) } catch {}
  if (v === 'no') clearMetrikaData()
}
// Отказ после согласия: стираем cookie и записи Метрики в браузере (_ym_uid, _ym_d, _ym_isad и другие _ym*)
export function clearMetrikaData() {
  try {
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0].trim()
      if (!name.startsWith('_ym')) continue
      for (const dom of ['', `; Domain=${location.hostname}`, `; Domain=.${location.hostname.replace(/^www\./, '')}`]) document.cookie = `${name}=; Max-Age=0; Path=/${dom}`
    }
    for (const st of [localStorage, sessionStorage]) for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k?.startsWith('_ym')) st.removeItem(k) }
  } catch {}
}

function hostAllowed(): boolean {
  try {
    if (location.hostname === 'psycont.ru' || location.hostname === 'www.psycont.ru') return true
    return localStorage.getItem('psy_metrika_dev') === '1'
  } catch { return false }
}

// Адрес для Метрики: без hash и без query, кроме меток рекламы. В адресах входа лежат одноразовые токены
// (/auth/podtverdit?token_hash=..., #access_token=...), в Метрику они уйти не должны
const KEEP = /^(utm_[a-z]+|yclid|gclid|ysclid)$/i
export function cleanUrl(href: string): string {
  try {
    const u = new URL(href)
    const q = new URLSearchParams()
    u.searchParams.forEach((v, k) => { if (KEEP.test(k)) q.append(k, v) })
    const s = q.toString()
    return `${u.origin}${u.pathname}${s ? '?' + s : ''}`
  } catch { return '' }
}
const here = () => cleanUrl(location.href)

let loaded = false
let lastUrl = ''
export const metrikaLoaded = () => loaded

// Запоминаем адрес входа с UTM до согласия: если человек нажмет «Принять» на другой странице, метки не потеряются
export function rememberLandingUrl() {
  try {
    if (sessionStorage.getItem(LAND_URL_KEY)) return
    if (/[?&](utm_[a-z]+|yclid|gclid)=/i.test(location.search)) sessionStorage.setItem(LAND_URL_KEY, JSON.stringify({ url: here(), ref: cleanUrl(document.referrer) }))
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
  const now = here()
  const first = saved?.url && saved.url !== now ? saved.url : now
  w.ym(METRIKA_ID, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: first === now ? cleanUrl(document.referrer) : saved?.ref || '', url: first, accurateTrackBounce: true, trackLinks: true,
  })
  if (first !== now) w.ym(METRIKA_ID, 'hit', now, { referer: first })
  try { sessionStorage.removeItem(LAND_URL_KEY) } catch {}
  loaded = true
  lastUrl = now
  if (location.pathname.startsWith('/dashboard')) prepareFirsts()
  flushPending()
  return true
}

// Хит при смене адреса без перезагрузки. На закрытом пути с уже загруженной Метрикой перезагружаем страницу без нее.
export function metrikaRoute() {
  if (typeof window === 'undefined') return
  if (!metrikaPathAllowed(location.pathname)) { if (loaded) location.reload(); return }
  if (!loaded) { loadMetrika(); return }
  const now = here()
  if (now === lastUrl) return
  ;(window as any).ym(METRIKA_ID, 'hit', now, { referer: lastUrl })
  lastUrl = now
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

// Метрика готова к целям: уже загружена или есть согласие и ее можно загрузить сейчас (страница шлет цель раньше,
// чем баннер в конце layout успел загрузить Метрику; заглушка ym ставит цель в очередь после init)
const ready = () => getConsent() === 'yes' && (loaded || loadMetrika())

// Цель с закрытой страницы (/auth: подтверждение почты) ждет в sessionStorage и уходит на следующей открытой
const PENDING_KEY = 'psy_goal_pending'
function flushPending() {
  try {
    const list: string[] = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]')
    sessionStorage.removeItem(PENDING_KEY)
    for (const g of list) if (isGoal(g)) goal(g)
  } catch {}
}

export function goal(id: Goal): void {
  try {
    if (!isGoal(id)) return
    if (!metrikaPathAllowed(location.pathname)) {
      if (getConsent() === 'yes' && !location.pathname.startsWith('/admin')) {
        const list: string[] = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]')
        if (!list.includes(id)) sessionStorage.setItem(PENDING_KEY, JSON.stringify([...list, id]))
      }
      return
    }
    if (!ready()) return
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
  if (!firsts) {
    firsts = fetch('/api/metrika/firsts', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    // сбой не запоминаем: следующий вызов спросит базу снова
    firsts.then(v => { if (!v) firsts = null })
  }
  return firsts
}
// Вызывать при открытии экрана «Сделать»: ответ базы нужен до действия, после него база уже знает о нем
export function prepareFirsts() { if (loaded) void loadFirsts() }
export async function goalFirst(k: FirstKey): Promise<void> {
  try {
    if (!ready()) return
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
  if (typeof window === 'undefined' || getConsent() !== 'yes') return
  switch (event) {
    case 'land_cta_click':
      goal('land_cta')
      if (props?.place === 'pricing') goal('plan_click')
      break
    case 'onb_step_done': {
      const n = Number(props?.step)
      // анкета 2 (26.11): шесть вопросов; пропуск необязательных 4 и 5 тоже пишет onb_step_done (done() в express)
      if (n >= 1 && n <= 6) goal(`onb_step_${n}` as Goal)
      break
    }
    case 'onb_done': goal('onb_done'); break
    case 'paywall_view': goal('paywall_view'); break
    case 'plan_click': goal('plan_click'); break
    case 'auth_link_ok': if (props?.kind === 'signup') goal('signup_done'); break
    // Оплата (ветка feat/oplata): экран итога пишет feature_open pay_itog_done только после ответа сервера
    // «succeeded» (/api/pay/status), а не при возврате со страницы ЮKassa. Один раз на платеж (номер платежа ?p=).
    case 'feature_open':
      if (props?.feature === 'pay_itog_done') {
        try {
          const p = new URLSearchParams(location.search).get('p') || ''
          if (!/^[0-9a-f-]{36}$/.test(p) || localStorage.getItem(`psy_g_pay_${p}`) === '1') break
          localStorage.setItem(`psy_g_pay_${p}`, '1')
          goal('pay_success')
        } catch {}
      }
      break
    case 'material_take': if (String(props?.how || '').startsWith('copy')) void goalFirst('copy'); break
  }
}

// Цели, которые сервер передал через короткую cookie psy_goal (вход через Яндекс: редирект с сервера)
export function goalsFromCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)psy_goal=([^;]+)/)
    if (!m) return
    const c = getConsent()
    if (c === null) return // ждет ответа в баннере: после «Принять» уйдет, cookie живет 10 минут
    document.cookie = 'psy_goal=; Max-Age=0; Path=/; SameSite=Lax'
    if (c === 'no') return
    for (const g of decodeURIComponent(m[1]).split(',')) if (isGoal(g)) goal(g)
  } catch {}
}
