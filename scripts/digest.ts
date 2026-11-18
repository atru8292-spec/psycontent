// УСТАРЕЛО, ЗАМЕНЕНА 18.11: утреннюю сводку теперь шлет бот поддержки (/api/cron/bot-summary, lib/bot, deploy/bot).
// Этот скрипт оставлен для ручного --dry/--print; cron digest.ts на сервере убрать, чтобы утром не было двух сообщений.
// Утренняя сводка за вчера Арине в Telegram (аналитика 2, 24.10). Без почт, текстов постов и своих слов опроса.
//   npx tsx scripts/digest.ts --dry                       текст на демо-данных кабинета (lib/analytics/demo.ts), без базы и без отправки
//   npx tsx --env-file=.env scripts/digest.ts --print     настоящие цифры, только напечатать
//   npx tsx --env-file=.env scripts/digest.ts             настоящие цифры и отправка, если заданы DIGEST_TG_BOT_TOKEN и DIGEST_TG_CHAT_ID
// Без переменных бота ничего не отправляет и не падает. Cron 9:00 по ADMIN_TZ: см. CLAUDE.md и отчет.
import { buildDigest, digestFrom, yesterdayIn } from '../lib/analytics/digest'
// начало текущего месяца по Москве (лимиты считаются по Europe/Moscow)
const monthStartMsk = () => { const m = new Date(Date.now() + 3 * 3600e3); return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1) - 3 * 3600e3) }

const argv = process.argv.slice(2)
const tz = process.env.ADMIN_TZ || 'Asia/Barnaul'

async function send(text: string) {
  const token = process.env.DIGEST_TG_BOT_TOKEN, chat = process.env.DIGEST_TG_CHAT_ID
  if (!token || !chat) { console.log('DIGEST_TG_BOT_TOKEN или DIGEST_TG_CHAT_ID не заданы: не отправляю'); return }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  }).catch(e => ({ ok: false, status: 0, text: async () => String(e?.message) }) as any)
  if (!res.ok) console.error(`telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
  else console.log('сводка отправлена')
}

;(async () => {
  const y = yesterdayIn(tz)
  if (argv.includes('--dry')) {
    const demo = await import('../lib/analytics/demo')
    // демо-люди выдуманы и раскиданы по последним дням: «вчера» берем по их датам
    const people = demo.demoPeople()
    const text = buildDigest(digestFrom({
      label: y.label, from: y.from, to: y.to, people, overview: demo.demoOverview(),
      aiRubDay: demo.demoCosts().by_day.at(-1)?.rub || 0, aiRubMonth: demo.demoCosts().total_rub,
      onboarded: 2, genErrors: demo.demoMake().errors,
      exits: [{ reasons: ['not_me', 'same'] }, { reasons: ['pause'] }, { reasons: ['no_clients'] }, { reasons: ['start'], place: 'stuck' }, { reasons: ['profile_long', 'busy'], place: 'stuck' }],
    }))
    console.log(text)
    return
  }
  const { getSupabaseAdmin } = await import('../lib/generation/db')
  const db = getSupabaseAdmin()
  const internal = (process.env.INTERNAL_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
  const base = { p_exclude_emails: internal, p_exclude_test: true }
  const day = { p_from: y.from.toISOString(), p_to: y.to.toISOString() }
  const [people, overview, costDay, costMonth, users] = await Promise.all([
    db.rpc('analytics_people', { ...base, p_tz: tz }),
    db.rpc('analytics_overview', { ...base, p_tz: tz }),
    db.rpc('analytics_costs', { ...base, ...day, p_tz: tz }),
    db.rpc('analytics_costs', { ...base, p_from: monthStartMsk().toISOString(), p_to: null, p_tz: tz }),
    db.rpc('_analytics_users', base),
  ])
  for (const r of [people, overview, costDay, costMonth, users]) if (r.error) throw new Error(r.error.message)
  const allowed = new Set((users.data || []).map((u: any) => u.user_id))
  const countEvent = async (event: string) => {
    const r = await db.from('events').select('user_id').eq('event', event).gte('created_at', y.from.toISOString()).lt('created_at', y.to.toISOString()).limit(5000)
    if (r.error) console.warn(`сводка: ${event} не прочитались (${r.error.message}), в тексте будет 0`)
    return (r.data || []).filter((e: any) => allowed.has(e.user_id))
  }
  const [onb, errs] = await Promise.all([countEvent('onb_done'), countEvent('make_error')])
  const ex = await db.from('exit_surveys').select('user_id, reasons, place').gte('created_at', y.from.toISOString()).lt('created_at', y.to.toISOString())
  const text = buildDigest(digestFrom({
    label: y.label, from: y.from, to: y.to, people: people.data || [], overview: overview.data,
    aiRubDay: costDay.data?.total_rub || 0, aiRubMonth: costMonth.data?.total_rub || 0,
    onboarded: new Set(onb.map((e: any) => e.user_id)).size, genErrors: errs.length,
    exits: (ex.error ? (console.warn(`сводка: опрос не прочитался (${ex.error.message})`), []) : ex.data || []).filter((e: any) => allowed.has(e.user_id)),
  }))
  console.log(text)
  if (!argv.includes('--print')) await send(text)
})().catch(e => { console.error('сводка:', e?.message || e); process.exit(1) })
