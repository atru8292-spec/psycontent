// Единая точка замеров на клиенте (задача analitika, этап 2). Сторонних счетчиков нет: события уходят пачкой
// в свой роут /api/ev (адрес без «track» и «analytics», такие режут блокировщики) и пишутся в таблицу events.
// Список событий и разрешенные ключи: lib/analytics/events.ts (там же описание каждого, включая onb_*).
// Тексты постов, тем и имен в props не передавать: сервер их все равно выкинет (lib/analytics/sanitize.ts).
//
// track никогда не бросает и ничего не ждет: аналитика не имеет права сломать экран.
// Сессия: новая, если с прошлого события прошло больше 30 минут; при новой сессии сам шлет app_open.
// В dev события тоже пишутся (чтобы проверить кабинет локально) и дублируются в console.debug.

import type { EventName } from './analytics/events'
import { cleanPath } from './analytics/sanitize'

export type TrackProps = Record<string, string | number | boolean>

type Queued = { event: EventName | string; props?: TrackProps; path: string | null; session_id: string; ts: number }

const ENDPOINT = '/api/ev'
const FLUSH_MS = 5000
export const SESSION_GAP_MS = 30 * 60 * 1000
const SESSION_KEY = 'psy_sess'
const MAX_BATCH = 50

let queue: Queued[] = []
let timer: ReturnType<typeof setTimeout> | null = null
// o: в этой сессии уже ушел app_open (события лендинга его не запускают)
type Sess = { id: string; last: number; o?: boolean }
let mem: Sess | null = null
let listening = false

const isDev = process.env.NODE_ENV !== 'production'

// Правило сессии отдельно, чтобы его проверял тест
export const isNewSession = (last: number | null, now: number) => last === null || now - last > SESSION_GAP_MS

function newId(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` }
}

// Сессия в localStorage, без него в памяти
function save(next: Sess) {
  mem = next
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)) } catch {}
}

function session(now: number): Sess {
  let cur = mem
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) { const s = JSON.parse(raw); if (s && typeof s.id === 'string' && typeof s.last === 'number') cur = s }
  } catch {}
  const isNew = isNewSession(cur ? cur.last : null, now)
  const next: Sess = isNew || !cur ? { id: newId(), last: now, o: false } : { id: cur.id, last: now, o: !!cur.o }
  save(next)
  return next
}

function deviceProps(): TrackProps {
  const p: TrackProps = {}
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    p.device = coarse || window.innerWidth < 768 ? 'mobile' : 'desktop'
    p.standalone = !!(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone)
    const ref = document.referrer
    p.ref = !ref ? 'direct' : new URL(ref).host === location.host ? 'internal' : 'other'
  } catch {}
  return p
}

// signup_source: cookie psy_src ставит middleware при первом заходе на сайт (только коды, без адресов).
// Шлем при первом app_open, сервер сам следит, чтобы у человека была одна такая запись.
function signupSource(): TrackProps | null {
  try {
    if (localStorage.getItem('psy_src_sent') === '1') return null
    const m = document.cookie.match(/(?:^|;\s*)psy_src=([^;]+)/)
    if (!m) return null
    const out: TrackProps = {}
    for (const part of decodeURIComponent(m[1]).split('|')) {
      const [k, v] = part.split(':')
      if (['src', 'medium', 'campaign', 'ref'].includes(k) && v) out[k] = v
    }
    localStorage.setItem('psy_src_sent', '1')
    return Object.keys(out).length ? out : null
  } catch { return null }
}

function send(batch: Queued[], beacon: boolean) {
  if (!batch.length) return
  const body = JSON.stringify({ events: batch.slice(0, MAX_BATCH) })
  try {
    if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return
    }
  } catch {}
  try {
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {}
}

function flush(beacon = false) {
  if (timer) { clearTimeout(timer); timer = null }
  while (queue.length) send(queue.splice(0, MAX_BATCH), beacon)
}

function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true) })
    window.addEventListener('pagehide', () => flush(true))
  } catch {}
}

export function track(event: EventName | string, props?: TrackProps): void {
  try {
    if (typeof window === 'undefined') return
    listen()
    const now = Date.now()
    const s = session(now)
    const path = cleanPath(location.pathname)
    // События лендинга (land_*) пишутся и без входа и не запускают app_open: иначе одноразовый
    // signup_source ушел бы до регистрации, сервер его выбросил бы, и источник потерялся бы.
    // app_open и signup_source уйдут с первым событием не лендинга в этой сессии.
    const landing = String(event).startsWith('land_')
    if (!landing && !s.o) {
      if (event !== 'app_open') queue.push({ event: 'app_open', props: deviceProps(), path, session_id: s.id, ts: now })
      const src = signupSource()
      if (src) queue.push({ event: 'signup_source', props: src, path, session_id: s.id, ts: now })
      save({ ...s, o: true })
    }
    queue.push({ event, props, path, session_id: s.id, ts: now })
    // eslint-disable-next-line no-console
    if (isDev) console.debug('[track]', event, props || {})
    if (queue.length >= MAX_BATCH) flush()
    else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS)
  } catch {}
}
