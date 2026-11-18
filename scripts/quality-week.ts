// Недельный подсчет качества и шаблонности текстов (аналитика 2, 24.10). Читает материалы прошедшей недели,
// считает числа (lib/analytics/quality-week.ts) и пишет их в quality_weekly. Тексты читаются только в памяти
// процесса, наружу уходят одни числа. Модель не нужна.
//
//   npx tsx --env-file=.env scripts/quality-week.ts                 прошлая закрытая неделя (пн-вс по ADMIN_TZ)
//   npx tsx --env-file=.env scripts/quality-week.ts --week=2026-10-12   конкретная неделя (дата понедельника)
//   npx tsx --env-file=.env scripts/quality-week.ts --show-chains   еще и частые цепочки в _знания/kachestvo/ (локально, не в git)
//   npx tsx scripts/quality-week.ts --dry                           демо без базы: печатает строки
//
// Cron на сервере (понедельник 06:00 по Барнаулу, после конца недели): см. отчет и CLAUDE.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeWeek, demoWeekPosts, lastClosedWeek, weekOf, type WeekPost } from '../lib/analytics/quality-week'
import { chainAuthors, type QText } from '../lib/analytics/quality'
import { anonymize } from '../lib/anonymize'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const tz = process.env.ADMIN_TZ || 'Asia/Barnaul'
const CHAIN_MIN_AUTHORS = 5

function showChains(week: string, posts: WeekPost[]) {
  const list: QText[] = posts.map(p => ({ userId: p.userId, format: p.format, text: p.text }))
  const common = [...chainAuthors(list)].filter(([, s]) => s.size >= CHAIN_MIN_AUTHORS).sort((a, b) => b[1].size - a[1].size)
  const dir = join(__dirname, '..', '_знания', 'kachestvo')
  mkdirSync(dir, { recursive: true })
  // после анонимайзера: если в цепочке случайно имя или контакт, в файл уйдет заглушка
  const lines = common.map(([g, s]) => `- «${anonymize(g).masked}» у ${s.size} людей`)
  const f = join(dir, `cepochki-${week}.md`)
  writeFileSync(f, `# Частые цепочки из 4 слов, неделя с ${week}\n\nТолько цепочки, которые есть у ${CHAIN_MIN_AUTHORS} и больше разных людей. Файл локальный, в git и в кабинет не попадает.\n\n${lines.join('\n') || 'нет'}\n`)
  console.log(`цепочки: ${f} (${common.length})`)
}

;(async () => {
  if (argv.includes('--dry')) {
    const posts = demoWeekPosts()
    const rows = computeWeek('2026-10-12', posts, { all: 3, post: 1, carousel: 2 })
    for (const r of rows.filter(r => r.variant === 'all')) console.log(r.format.padEnd(14), r.texts, JSON.stringify(r.metrics))
    if (argv.includes('--show-chains')) showChains('demo', posts)
    return
  }
  const { getSupabaseAdmin } = await import('../lib/generation/db')
  const db = getSupabaseAdmin()
  const w = flag('week') ? weekOf(new Date(`${flag('week')}T12:00:00Z`), tz) : lastClosedWeek(new Date(), tz)
  const internal = (process.env.INTERNAL_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
  const users = await db.rpc('_analytics_users', { p_exclude_emails: internal, p_exclude_test: true })
  if (users.error) throw new Error(`_analytics_users: ${users.error.message}`)
  const allowed = new Set((users.data || []).map((u: any) => u.user_id))

  // материалы недели: без хуков и рерайтов, без служебных; content только в памяти
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('generated_posts')
      .select('id, user_id, format, content, plan, pipeline_version, feedback, is_favorite, published_at')
      .gte('created_at', w.from.toISOString()).lt('created_at', w.to.toISOString())
      .neq('format', 'hooks').not('format', 'like', 'rewrite%').order('id').range(from, from + 999)
    if (error) throw new Error(`generated_posts: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const mine = rows.filter(r => allowed.has(r.user_id))
  const ids = mine.map(r => r.id)
  // взяли: событие material_take с этим post (до сегодня), опубликовала или сохранила карусель
  const taken = new Set<string>(mine.filter(r => r.published_at).map(r => r.id))
  const adjusts = new Map<string, number>()
  // куски по 100 id: ответ PostgREST не больше 1000 строк, на 100 материалов событий взятия и правок меньше
  const full = (r: { data: unknown[] | null }, what: string) => { if ((r.data || []).length >= 1000) console.warn(`${what}: ровно 1000 строк, часть могла обрезаться`) }
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100)
    const [t, a, c] = await Promise.all([
      db.from('events').select('props').eq('event', 'material_take').in('props->>post', part),
      db.from('events').select('props').eq('event', 'material_adjust').in('props->>post', part),
      db.from('carousel_designs').select('post_id').gt('export_count', 0).in('post_id', part),
    ])
    for (const [r, what] of [[t, 'material_take'], [a, 'material_adjust'], [c, 'carousel_designs']] as const) {
      if (r.error) throw new Error(`${what}: ${r.error.message}`)
      full(r, what)
    }
    for (const e of t.data || []) taken.add(e.props?.post)
    for (const e of a.data || []) adjusts.set(e.props?.post, (adjusts.get(e.props?.post) || 0) + 1)
    for (const d of c.data || []) taken.add(d.post_id)
  }
  const errs = await db.from('events').select('user_id, props').eq('event', 'make_error').gte('created_at', w.from.toISOString()).lt('created_at', w.to.toISOString())
  if (errs.error) throw new Error(`make_error: ${errs.error.message}`)
  full(errs, 'make_error')
  const errorsByFormat: Record<string, number> = { all: 0 }
  for (const e of errs.data || []) {
    if (!allowed.has(e.user_id)) continue
    errorsByFormat.all++
    for (const f of String(e.props?.format || '').split(',').filter(Boolean)) errorsByFormat[f] = (errorsByFormat[f] || 0) + 1
  }
  const posts: WeekPost[] = mine.map(r => ({
    id: r.id, userId: r.user_id, format: r.format || 'post', // вариант промпта есть только у простого пути; полная цепочка и старый путь идут своим pipeline_version
    variant: r.pipeline_version === 'simple-1' && r.plan?.prompt_hyp ? r.plan.prompt_hyp : r.pipeline_version || 'old',
    text: r.content || '', taken: taken.has(r.id), adjusts: adjusts.get(r.id) || 0,
    verdict: r.feedback?.verdict || null, favorite: r.is_favorite === true,
  }))
  const out = computeWeek(w.start, posts, errorsByFormat).map(r => ({ ...r, computed_at: new Date().toISOString() }))
  const { error } = await db.from('quality_weekly').upsert(out, { onConflict: 'week_start,format,variant' })
  if (error) throw new Error(`quality_weekly: ${error.message}`)
  console.log(`неделя ${w.start}: ${posts.length} материалов, строк ${out.length}`)
  if (argv.includes('--show-chains')) showChains(w.start, posts)
})().catch(e => { console.error(e?.message || e); process.exit(1) })
