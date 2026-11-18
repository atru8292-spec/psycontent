// Сверка миграции 20261024100000_analytics_month_msk.sql с исходной функцией analytics_person из 20261005100000:
// отличаться может только строка v_period (UTC -> Europe/Moscow) и комментарий к ней. Без базы.
//   npx tsx scripts/check-month-msk.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = join(__dirname, '..', 'supabase', 'migrations')
const fn = (sql: string) => {
  const a = sql.indexOf('create or replace function public.analytics_person(')
  const b = sql.indexOf('\n$$;', a)
  if (a < 0 || b < 0) throw new Error('нет analytics_person')
  return sql.slice(a, b + 4).split('\n')
}
const old = fn(readFileSync(join(dir, '20261005100000_events_admin.sql'), 'utf8'))
const neu = fn(readFileSync(join(dir, '20261024100000_analytics_month_msk.sql'), 'utf8'))
if (old.length !== neu.length) { console.error(`разное число строк: ${old.length} и ${neu.length}`); process.exit(1) }
const diff = old.map((l, i) => [l, neu[i]] as const).filter(([a, b]) => a !== b)
const allowed = diff.every(([a, b]) => (a.includes("to_char(now() at time zone 'UTC', 'YYYY-MM')") && b === a.replace("'UTC'", "'Europe/Moscow'")) || (a.trim().startsWith('--') && b.trim().startsWith('--')))
const code = diff.filter(([a]) => !a.trim().startsWith('--')).length
if (!allowed || code !== 1) { console.error('изменено не только v_period:', diff); process.exit(1) }
console.log(`ok: analytics_person, изменена 1 строка кода (v_period) и ${diff.length - code} комментарий`)
