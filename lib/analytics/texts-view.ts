// Вкладка «Тексты» кабинета (аналитика 2, SPEC B2): чистые функции поверх строк quality_weekly.
// Строки уже посчитаны по формату и варианту промпта (lib/analytics/quality-week.ts computeWeek), здесь только
// выбор среза, сведение нескольких строк в одну (рилс = все reels_*), недели и подписи. Текстов тут нет.
import type { QualityRow } from './admin-a2'
import { lastClosedWeek, weekOf } from './quality-week'

export type FormatFilter = 'all' | 'post' | 'carousel' | 'reels' | 'stories' | 'post_tg'
export const FORMAT_FILTERS: { id: FormatFilter; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'post', label: 'Пост' }, { id: 'carousel', label: 'Карусель' },
  { id: 'reels', label: 'Рилс' }, { id: 'stories', label: 'Сторис' }, { id: 'post_tg', label: 'Телеграм' },
]
export const FORMAT_ROW_RU: Record<string, string> = { post: 'Пост', carousel: 'Карусель', reels: 'Рилс', stories: 'Сторис', post_tg: 'Телеграм' }
// виды рилса по коду формата (подписи для кабинета, человеку они не показываются)
export const REELS_KIND_RU: Record<string, string> = {
  reels_monolog: 'объясняю одну вещь', reels_otvet: 'ответ на вопрос', reels_poslanie: 'важные слова',
  reels_istoriya: 'о себе', reels_spisok: 'список', reels_scenka: 'два голоса', reels_rol: 'роль',
  reels_malysh: 'как маленькому', reels_bez_slov: 'без слов', reels_doska: 'рисую и объясняю', reels_auto: 'вид выбран сам',
}
export const reelsKindRu = (f: string) => REELS_KIND_RU[f] || f.replace(/^reels_?/, '') || 'рилс'

export type TextsParams = { f: FormatFilter; v: string; w: '1' | '4' }
type SPRec = Record<string, string | string[] | undefined>
const one = (sp: SPRec, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
// фильтры из адреса: формат f, вариант промпта v (код как в quality_weekly), срок блока «по формату» w
export function textsParams(sp: SPRec): TextsParams {
  const f = one(sp, 'f'), v = one(sp, 'v'), w = one(sp, 'w')
  return { f: isFormatFilter(f) ? f : 'all', v: v && /^[a-z0-9_,.:-]{1,40}$/i.test(v) ? v : 'all', w: w === '4' ? '4' : '1' }
}

export const SMALL_SAMPLE = 10 // меньше 10 текстов: процентов не показываем, пишем «мало»
export const WINDOW_WEEKS = 8

export type Slice = { texts: number; m: Record<string, number | null> }

export const isFormatFilter = (v: string | undefined): v is FormatFilter => !!v && FORMAT_FILTERS.some(f => f.id === v)
const matchFormat = (f: FormatFilter | string, rowFormat: string) =>
  f === 'all' ? rowFormat === 'all' : f === 'reels' ? rowFormat.startsWith('reels') : rowFormat === f

// Несколько строк в одну: доли и средние взвешиваем по числу текстов. Число цепочек (chains) и авторов так не
// сводится (одна цепочка могла быть в двух строках), поэтому у сведенной строки их нет.
export function combine(rows: QualityRow[]): Slice | null {
  if (!rows.length) return null
  if (rows.length === 1) return { texts: rows[0].texts, m: { ...rows[0].metrics } }
  const texts = rows.reduce((a, r) => a + r.texts, 0)
  const keys = new Set(rows.flatMap(r => Object.keys(r.metrics)))
  const m: Record<string, number | null> = {}
  for (const k of keys) {
    if (k === 'chains' || k === 'authors') { m[k] = null; continue }
    if (k === 'materials') { m[k] = rows.reduce((a, r) => a + (r.metrics[k] || 0), 0); continue }
    m[k] = texts ? rows.reduce((a, r) => a + (r.metrics[k] || 0) * r.texts, 0) / texts : 0
  }
  return { texts, m }
}

export function slice(rows: QualityRow[], weeks: string[], f: FormatFilter | string, v: string): Slice | null {
  const ws = new Set(weeks)
  return combine(rows.filter(r => ws.has(r.week_start) && matchFormat(f, r.format) && r.variant === v))
}

export const variantsOf = (rows: QualityRow[]) => [...new Set(rows.map(r => r.variant).filter(v => v !== 'all'))].sort()
export const reelsKindsOf = (rows: QualityRow[]) => [...new Set(rows.map(r => r.format).filter(f => f.startsWith('reels')))].sort()

// даты недели: строка YYYY-MM-DD понедельника, считаем календарно в UTC (часовой пояс уже учтен при подсчете)
const toUtc = (ws: string) => { const [y, m, d] = ws.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)
export const shiftWeek = (ws: string, n: number) => fromUtc(toUtc(ws) + n * 7 * 86400000)

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export function weekRange(ws: string): string {
  const a = new Date(toUtc(ws)), b = new Date(toUtc(ws) + 6 * 86400000)
  const da = a.getUTCDate(), db = b.getUTCDate(), ma = MONTHS[a.getUTCMonth()], mb = MONTHS[b.getUTCMonth()]
  return ma === mb ? `${da}-${db} ${mb}` : `${da} ${ma}-${db} ${mb}`
}
export const weekShort = (ws: string) => { const a = new Date(toUtc(ws)); return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}` }

// окно: 8 закрытых недель (новая первой) и текущая, если она уже посчитана
export function weekWindow(rows: QualityRow[], now: Date, tz: string) {
  const current = weekOf(now, tz).start
  const last = lastClosedWeek(now, tz).start
  const closed = Array.from({ length: WINDOW_WEEKS }, (_, i) => shiftWeek(last, -i))
  const hasCurrent = rows.some(r => r.week_start === current)
  return { current, last, closed, hasCurrent, all: hasCurrent ? [current, ...closed] : closed }
}

export const pct = (x: number | null | undefined) => (x == null ? 'нет' : `${Math.round(x * 100)}%`)
export const dec = (x: number | null | undefined) => (x == null ? 'нет' : (Math.round(x * 10) / 10).toString().replace('.', ','))
