// SQL резерва текстов (миграция 20261120100000_text_reserve) на PGlite: Postgres в памяти, без сети и без боевой базы.
// PGlite в проект НЕ ставится: npm i @electric-sql/pglite в отдельной папке (по умолчанию ~/Downloads/psy-shots),
// путь к ней можно задать PGLITE_DIR. Запуск из корня репозитория:
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/sql/test-text-reserve.ts
// Параллельность PGlite не проверить (одно соединение): ее держит pg_advisory_xact_lock, тест проверяет, что замок берется.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const DIR = process.env.PGLITE_DIR || join(homedir(), 'Downloads', 'psy-shots')
const U = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

async function main() {
  const { PGlite } = await import(pathToFileURL(join(DIR, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href)
  const db = new PGlite()
  // минимум окружения Supabase: роли, auth.users, счетчик как в 20260625130000_energy_foundation
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${U}'), ('${P}'), ('${OTHER}');
    create table public.text_usage_counter (
      user_id uuid not null references auth.users(id) on delete cascade,
      period text not null,
      count integer not null default 0,
      primary key (user_id, period)
    );
    grant usage on schema public to anon, authenticated, service_role;
  `)
  await db.exec(readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261120100000_text_reserve.sql'), 'utf8'))

  const one = async (sql: string, params: any[] = []) => (await db.query(sql, params)).rows[0] as any
  const reserve = async (u: string, period: string, cap: number, units: number, free: boolean) =>
    (await one('select public.reserve_text_usage($1, $2, $3, $4, $5) as r', [u, period, cap, units, free])).r
  const commit = async (id: string | null, u: string, period: string, units = 1) =>
    (await one('select public.commit_text_reserve($1, $2, $3, $4) as r', [id, u, period, units])).r
  const release = (id: string, u: string) => db.query('select public.release_text_reserve($1, $2)', [id, u])
  const count = async (u: string, period: string) => Number((await one('select coalesce(sum(count), 0) as c from text_usage_counter where user_id = $1 and period = $2', [u, period])).c)
  const reserves = async (u: string) => Number((await one('select count(*) as c from text_usage_reserve where user_id = $1', [u])).c)

  // ── права: только service_role ──
  for (const f of ['public.reserve_text_usage(uuid,text,integer,integer,boolean)', 'public.commit_text_reserve(uuid,uuid,text,integer)', 'public.release_text_reserve(uuid,uuid)']) {
    const r = await one(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed, has_function_privilege('service_role', $1, 'execute') as service`, [f])
    assert.deepEqual(r, { anon: false, authed: false, service: true }, `права ${f}`)
  }
  const t = await one(`select has_table_privilege('anon', 'public.text_usage_reserve', 'select') as a, has_table_privilege('authenticated', 'public.text_usage_reserve', 'insert') as b, (select relrowsecurity from pg_class where oid = 'public.text_usage_reserve'::regclass) as rls`)
  assert.deepEqual(t, { a: false, b: false, rls: true }, 'таблица брони закрыта, RLS включен')
  await db.exec('set role anon')
  await assert.rejects(db.query(`select public.reserve_text_usage('${U}', '2026-11', 10, 1, true)`), /permission denied/, 'anon не может звать reserve')
  await db.exec('reset role')
  await db.exec('set role service_role')
  const asService = await reserve(OTHER, '2026-11', 10, 1, true)
  assert.equal(asService.ok, true, 'service_role зовет reserve')
  await db.exec('reset role')

  // ── бесплатный: 9 из 10 (за разные месяцы, окно подписки не в счет) ──
  await db.exec(`insert into text_usage_counter values ('${U}', '2026-10', 5), ('${U}', '2026-11', 4), ('${U}', 'w2026-09-01', 30)`)
  const a = await reserve(U, '2026-11', 10, 1, true)
  assert.deepEqual([a.ok, a.used], [true, 9], 'бесплатный 9 из 10: бронь 1 ок')
  const b = await reserve(U, '2026-11', 10, 1, true)
  assert.deepEqual([b.ok, b.used], [false, 10], 'вторая бронь: отказ, занято 10')
  assert.equal(b.id, undefined)
  // замок пользователя берется внутри вызова
  await db.exec('begin')
  await one(`select public.reserve_text_usage('${U}', '2026-11', 10, 1, true)`)
  const locks = await one(`select count(*) as c from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`)
  assert.ok(Number(locks.c) >= 1, 'advisory-замок взят')
  await db.exec('rollback')

  // commit: счетчик 10, брони нет
  const c = await commit(a.id, U, '2026-11')
  assert.deepEqual(c, { count: 5, left: 0 }, 'commit: +1 к месяцу брони (было 4)')
  assert.equal(await reserves(U), 0, 'бронь снята')
  assert.equal((await reserve(U, '2026-11', 10, 1, true)).ok, false, '10 из 10: отказ')

  // ── release: бронь отпущена, место снова есть ──
  await db.exec(`update text_usage_counter set count = 4 where user_id = '${U}' and period = '2026-11'`)
  const r1 = await reserve(U, '2026-11', 10, 1, true)
  assert.equal((await reserve(U, '2026-11', 10, 1, true)).ok, false)
  await release(r1.id, OTHER)
  assert.equal(await reserves(U), 1, 'чужой user_id бронь не снимает')
  await release(r1.id, U)
  assert.equal(await reserves(U), 0, 'release снял бронь')
  assert.equal(await count(U, '2026-11'), 4, 'release счетчик не трогает')
  const r2 = await reserve(U, '2026-11', 10, 1, true)
  assert.equal(r2.ok, true, 'после release снова можно')

  // ── просроченная бронь не считается и удаляется ──
  await db.exec(`update text_usage_reserve set created_at = now() - interval '16 minutes' where id = '${r2.id}'`)
  const r3 = await reserve(U, '2026-11', 10, 1, true)
  assert.deepEqual([r3.ok, r3.used], [true, 9], 'просроченная не держит место')
  assert.equal(Number((await one(`select count(*) as c from text_usage_reserve where id = '${r2.id}'`)).c), 0, 'просроченная удалена')
  // commit по истекшей брони: текст выдан, засчитываем по p_period
  await release(r3.id, U)
  const late = await commit(r3.id, U, '2026-11')
  assert.equal(late.count, 5, 'брони уже нет, +1 по p_period')
  const none = await commit(null, U, '2026-12')
  assert.equal(none.count, 1, 'без id тоже +1 (новая строка месяца)')

  // ── набор форматов: бронь на 3, два commit, release остатка ──
  await db.exec(`delete from text_usage_counter where user_id = '${U}'; insert into text_usage_counter values ('${U}', '2026-11', 7)`)
  const g = await reserve(U, '2026-11', 10, 3, true)
  assert.equal(g.ok, true, '7 + 3 = 10')
  assert.deepEqual(await commit(g.id, U, '2026-11'), { count: 8, left: 2 })
  assert.deepEqual(await commit(g.id, U, '2026-11'), { count: 9, left: 1 })
  await release(g.id, U)
  assert.deepEqual([await count(U, '2026-11'), await reserves(U)], [9, 0], 'упавший формат не списан')
  const part = await reserve(U, '2026-11', 10, 2, true)
  assert.deepEqual([part.ok, part.used], [false, 9], 'на 2 места не хватает')
  // чужая бронь в лимит не входит
  assert.equal((await reserve(U, '2026-11', 10, 1, true)).ok, true, 'бронь OTHER не мешает U')
  await db.exec(`delete from text_usage_reserve where user_id = '${U}'`)

  // ── платный: окно 'w...', пробные месяцы не в счет, брони на другом ключе тоже ──
  await db.exec(`insert into text_usage_counter values ('${P}', '2026-11', 10), ('${P}', 'w2026-11-17', 49)`)
  await reserve(P, '2026-11', 10, 1, true).then(() => {}) // бронь на пробном ключе (после окна не должна мешать окну)
  const p1 = await reserve(P, 'w2026-11-17', 50, 1, false)
  assert.deepEqual([p1.ok, p1.used], [true, 49], 'платный 49 из 50 по окну: ок')
  const p2 = await reserve(P, 'w2026-11-17', 50, 1, false)
  assert.deepEqual([p2.ok, p2.used], [false, 50], 'платный: вторая бронь отказ')
  assert.deepEqual(await commit(p1.id, P, 'ignored'), { count: 50, left: 0 }, 'ключ счетчика берется из брони')
  assert.equal(await count(P, 'ignored'), 0)

  // ── плохие аргументы ──
  await assert.rejects(reserve(U, '2026-11', 10, 0, true), /bad arguments/, 'units 0 нельзя')
  await assert.rejects(commit(null, U, '2026-11', 0), /bad arguments/)

  // ── удаление аккаунта уносит брони ──
  await reserve(OTHER, '2026-11', 10, 1, true)
  await db.exec(`delete from text_usage_counter where user_id = '${OTHER}'; delete from auth.users where id = '${OTHER}'`)
  assert.equal(await reserves(OTHER), 0, 'on delete cascade')

  // откат из шапки миграции проходит
  const mig = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261120100000_text_reserve.sql'), 'utf8')
  const rollback = mig.split('\n').filter(l => /^--   drop (function|table) if exists/.test(l)).map(l => l.replace(/^--\s+/, '')).join('\n')
  assert.equal(rollback.split('\n').length, 4)
  await db.exec(rollback)
  assert.equal(Number((await one(`select count(*) as c from pg_proc where proname in ('reserve_text_usage','commit_text_reserve','release_text_reserve')`)).c), 0, 'откат удалил функции')

  await db.close()
  console.log('test-text-reserve (PGlite): все проверки прошли')
}

main().catch(e => { console.error(e); process.exit(1) })
