// Недельный подсчет качества (аналитика 2): из материалов недели строки для quality_weekly. Чистая функция,
// ввод-вывод в scripts/quality-week.ts. В строках только числа.
import { qualityOf, signalsOf, type QText } from './quality'

export type WeekPost = {
  id: string; userId: string; format: string; variant: string; text: string
  taken: boolean; adjusts: number; verdict?: string | null; favorite?: boolean
}
export type WeekRow = { week_start: string; format: string; variant: string; texts: number; metrics: Record<string, number> }

// начало недели (понедельник) в часовом поясе tz, как дата YYYY-MM-DD, и границы недели в UTC
export function weekOf(d: Date, tz: string): { start: string; from: Date; to: Date } {
  const local = new Date(d.toLocaleString('en-US', { timeZone: tz }))
  const offset = local.getTime() - d.getTime()
  const day = (local.getDay() + 6) % 7 // пн = 0
  const mon = new Date(local.getFullYear(), local.getMonth(), local.getDate() - day)
  const start = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
  const from = new Date(mon.getTime() - offset)
  return { start, from, to: new Date(from.getTime() + 7 * 86400000) }
}
export const lastClosedWeek = (now: Date, tz: string) => weekOf(new Date(weekOf(now, tz).from.getTime() - 86400000), tz)

// errorsByFormat: ошибки генерации недели (make_error) по формату; ключ 'all' общий
export function computeWeek(week: string, posts: WeekPost[], errorsByFormat: Record<string, number>): WeekRow[] {
  const slices = new Map<string, WeekPost[]>()
  const add = (f: string, v: string, p: WeekPost) => { const k = `${f}|${v}`; if (!slices.has(k)) slices.set(k, []); slices.get(k)!.push(p) }
  for (const p of posts) { add('all', 'all', p); add(p.format, 'all', p); add('all', p.variant, p); add(p.format, p.variant, p) }
  if (!posts.length) slices.set('all|all', [])
  const rows: WeekRow[] = []
  for (const [k, list] of slices) {
    const [format, variant] = k.split('|')
    const err = variant === 'all' ? (format === 'all' ? errorsByFormat.all || 0 : errorsByFormat[format] || 0) : 0
    const sig = signalsOf(list.map(p => ({ taken: p.taken, adjusts: p.adjusts, verdict: p.verdict, favorite: p.favorite })), err)
    const q = qualityOf(list.map<QText>(p => ({ userId: p.userId, format: p.format, text: p.text })))
    const { texts, authors, ...qm } = q
    rows.push({ week_start: week, format, variant, texts: list.length, metrics: { ...sig, authors, ...qm } })
  }
  return rows
}

// Демо без базы: выдуманные тексты из шаблонов, у части людей одинаковое начало и общие цепочки (для --dry и тестов)
export function demoWeekPosts(seed = 1, n = 60): WeekPost[] {
  let s = seed
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const starts = ['Знаешь это чувство, когда', 'Ты снова говоришь себе', 'Многие думают, что', 'Вчера клиентка сказала', 'Сегодня про усталость', 'Есть одна штука, которую']
  const mids = ['ты держишься из последних сил и никому не говоришь.', 'усталость копится незаметно, а потом накрывает разом.', 'тревога любит тишину и пустой вечер.', 'тело помнит то, что голова давно забыла.', 'хочется все бросить и уехать к морю.', 'опора не появляется сама по себе.']
  const ends = ['Попробуй сегодня просто заметить это.', 'Что ты делаешь в такие моменты?', 'Сохрани, чтобы не потерять.', 'И это нормально.', 'Начни с одного шага.']
  const formats = ['post', 'post', 'carousel', 'reels_monolog', 'reels_scenka', 'stories', 'post_tg']
  const out: WeekPost[] = []
  for (let i = 0; i < n; i++) {
    const p = (a: string[]) => a[Math.floor(rnd() * a.length)]
    const text = [`${p(starts)} ${p(mids)}`, p(mids), p(mids), p(ends)].join('\n\n')
    out.push({
      id: `d${i}`, userId: `u${Math.floor(rnd() * 14)}`, format: p(formats), variant: rnd() < 0.7 ? 'h7,zh' : 'h0', text,
      taken: rnd() < 0.45, adjusts: rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0, verdict: rnd() < 0.08 ? 'not_like' : rnd() < 0.12 ? 'mine' : null,
    })
  }
  return out
}
