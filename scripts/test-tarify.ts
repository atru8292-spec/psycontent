// Тест тарифов без базы (fix/tarify, 12.11): пробный не обновляется по месяцам, платные обновляются,
// «Другой заход» тратит лимит, витрина без «из них N каруселей» и с теми же числами, что миграция.
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/test-tarify.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Минимальный клиент Supabase: from().select().eq()...[.maybeSingle()] по строкам в памяти
function fakeDb(rows: { user_id: string; period: string; count: number }[]) {
  return {
    from() {
      const f: Record<string, string> = {}
      const q: any = {
        select() { return q },
        eq(k: string, v: string) { f[k] = v; return q },
        get list() { return rows.filter(r => Object.entries(f).every(([k, v]) => (r as any)[k] === v)) },
        maybeSingle() { return Promise.resolve({ data: q.list[0] ?? null, error: null }) },
        then(res: any, rej: any) { return Promise.resolve({ data: q.list, error: null }).then(res, rej) },
      }
      return q
    },
  } as any
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
  const { usedForLimit, OPERATIONS } = await import('../lib/energy')
  const n = new Date()
  const now = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  const db = fakeDb([
    { user_id: 'u1', period: '2026-09', count: 4 },
    { user_id: 'u1', period: '2026-10', count: 3 },
    { user_id: 'u1', period: now, count: 2 },
    { user_id: 'u2', period: now, count: 5 },
  ])
  assert.equal(await usedForLimit(db, 'u1', 'free'), 9, 'пробный: счет за все месяцы, новый месяц не обнуляет')
  for (const code of ['start', 'practice', 'expert']) assert.equal(await usedForLimit(db, 'u1', code), 2, `${code}: только текущий месяц`)
  assert.equal(await usedForLimit(db, 'u3', 'free'), 0, 'новый человек: 0')

  // «Другой заход» тратит один материал: generate_post это текстовая операция, роут проверяет и списывает 1
  assert.equal(OPERATIONS.generate_post.kind, 'text')
  const adj = readFileSync(join(__dirname, '..', 'app', 'api', 'generate-post', 'adjust', 'route.ts'), 'utf8')
  assert.match(adj, /const ZAHOD_OP = 'generate_post'/)
  assert.match(adj, /canConsume\([^)]*ZAHOD_OP, 1\)/, '«Другой заход» проверяет лимит на 1 материал')
  assert.match(adj, /commitConsume\([^)]*ZAHOD_OP, decision\)/, '«Другой заход» списывает материал')
  const en = readFileSync(join(__dirname, '..', 'lib', 'energy.ts'), 'utf8')
  assert.match(en, /const count = await usedForLimit\(db, userId, plan\.code\)/, 'решение о лимите считает через usedForLimit')

  // витрина: без подлимита каруселей, числа те же, что в миграции
  const { PLANS, planPerks } = await import('../lib/pricing')
  for (const p of PLANS) assert.ok(!planPerks(p).some(x => /из них|\d+\s*карусел/iu.test(x)), `${p.name}: без «из них N каруселей»`)
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20261112100000_tarify_vitrina.sql'), 'utf8')
  for (const p of PLANS) for (const code of p.dbCodes) {
    const m = sql.match(new RegExp(`name = '([^']+)',\\s*price = (\\d+),\\s*fair_use_text_cap = (\\d+)\\s+where code = '${code}'`))
    assert.ok(m, `в миграции есть ${code}`)
    assert.deepEqual([m![1], Number(m![2]), Number(m![3])], [p.name, p.price, p.materials], `${code} совпадает с витриной ${p.name}`)
  }
  console.log('ok: пробный без срока, платные по месяцам, «Другой заход» тратит лимит, витрина и миграция совпадают')
}
main().catch(e => { console.error(e); process.exit(1) })
