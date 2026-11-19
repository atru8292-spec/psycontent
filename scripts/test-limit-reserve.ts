// Резерв текстов (20.11, миграция 20261120100000_text_reserve): без сети, на подмененной базе в памяти.
// Две вкладки при остатке 1: вторая получает отказ; упал → бронь отпущена → снова можно; набор форматов;
// окно оплаченной подписки; сбой rpc → server_error; функции нет → старый путь. Плюс проверка роутов по исходникам.
// SQL самих функций проверяет scripts/sql/test-text-reserve.ts (PGlite).
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/test-limit-reserve.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ME = '00000000-0000-4000-8000-000000000001'
const PAID = '00000000-0000-4000-8000-000000000002'
const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

// тихо: предупреждения кода в выводе теста не нужны (счетчик глубины: вызовы идут и параллельно)
const W = console.warn, ER = console.error
let depth = 0
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  if (depth++ === 0) { console.warn = () => {}; console.error = () => {} }
  try { return await fn() } finally { if (--depth === 0) { console.warn = W; console.error = ER } }
}

type Mode = 'live' | 'missing' | 'broken' | 'throws'
interface Reserve { id: string; user_id: string; period: string; units: number; created_at: number }

// Подмененный клиент Supabase: таблицы в памяти, rpc повторяет SQL из миграции (один поток JS = замок не нужен)
function fakeDb(opts: { mode?: Mode; counter?: { user_id: string; period: string; count: number }[] } = {}) {
  const st = {
    mode: (opts.mode || 'live') as Mode,
    counter: [...(opts.counter || [])],
    reserves: [] as Reserve[],
    usage: [] as any[],
    calls: [] as string[],
    now: Date.now(),
    seq: 0,
  }
  const plans = [
    { id: 'p-free', code: 'free', name: 'Пробный', is_unlimited: false, energy_per_month: 0, fair_use_text_cap: 10, deep_analysis: false },
    { id: 'p-start', code: 'start', name: 'Спокойный ритм', is_unlimited: false, energy_per_month: 0, fair_use_text_cap: 50, deep_analysis: false },
  ]
  const subs = [
    { user_id: ME, plan_id: 'p-free', status: 'trial', period_start: null, period_end: null, billing_anchor_day: null },
    { user_id: PAID, plan_id: 'p-start', status: 'active', period_start: '2026-11-17T09:00:00Z', period_end: '2099-01-01T00:00:00Z', billing_anchor_day: 17 },
  ]
  const tables: Record<string, any[]> = { plans, user_subscription: subs, text_usage_counter: st.counter }
  const live = (r: Reserve) => r.created_at > st.now - 15 * 60000
  const sumCount = (u: string, free: boolean, p: string) => st.counter.filter(r => r.user_id === u && (free ? !r.period.startsWith('w') : r.period === p)).reduce((s, r) => s + r.count, 0)
  const sumRes = (u: string, free: boolean, p: string) => st.reserves.filter(r => r.user_id === u && (free ? !r.period.startsWith('w') : r.period === p)).reduce((s, r) => s + r.units, 0)
  const addCount = (u: string, p: string, n: number) => {
    const row = st.counter.find(r => r.user_id === u && r.period === p)
    if (row) row.count += n; else st.counter.push({ user_id: u, period: p, count: n })
  }
  const db: any = {
    from(t: string) {
      const f: Record<string, any> = {}
      const notLike: Record<string, string> = {}
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { f[k] = v; return q },
        not: (k: string, _op: string, v: string) => { notLike[k] = v; return q },
        get list() { return (tables[t] || []).filter(r => Object.entries(f).every(([k, v]) => r[k] === v) && Object.entries(notLike).every(([k, v]) => !String(r[k]).startsWith(v.replace('%', '')))) },
        maybeSingle: async () => ({ data: q.list[0] ?? null, error: null }),
        insert: async (row: any) => { if (t === 'usage_log') st.usage.push(row); return { error: null } },
        upsert: async (row: any) => { const ex = st.counter.find(r => r.user_id === row.user_id && r.period === row.period); if (ex) ex.count = row.count; else st.counter.push({ ...row }); return { error: null } },
        then: (res: any, rej: any) => Promise.resolve({ data: q.list, error: null }).then(res, rej),
      }
      return q
    },
    async rpc(name: string, a: any) {
      st.calls.push(name)
      if (st.mode === 'throws') throw new Error('network')
      if (st.mode === 'missing') return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } }
      if (st.mode === 'broken') return { data: null, error: { code: '57014', message: 'canceling statement' } }
      if (name === 'reserve_text_usage') {
        st.reserves = st.reserves.filter(r => r.user_id !== a.p_user_id || live(r))
        const used = sumCount(a.p_user_id, a.p_free, a.p_period) + sumRes(a.p_user_id, a.p_free, a.p_period)
        if (used + a.p_units > a.p_cap) return { data: { ok: false, used }, error: null }
        const id = `r-${++st.seq}`
        st.reserves.push({ id, user_id: a.p_user_id, period: a.p_period, units: a.p_units, created_at: st.now })
        return { data: { ok: true, id, used }, error: null }
      }
      if (name === 'commit_text_reserve') {
        const r = st.reserves.find(x => x.id === a.p_id && x.user_id === a.p_user_id)
        addCount(a.p_user_id, r ? r.period : a.p_period, a.p_units)
        if (r) { r.units -= a.p_units; if (r.units <= 0) st.reserves = st.reserves.filter(x => x !== r) }
        return { data: { left: r ? Math.max(0, r.units) : 0 }, error: null }
      }
      if (name === 'release_text_reserve') {
        st.reserves = st.reserves.filter(x => !(x.id === a.p_id && x.user_id === a.p_user_id))
        return { data: null, error: null }
      }
      if (name === 'increment_text_usage') { addCount(a.p_user_id, a.p_period, 1); return { data: 1, error: null } }
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    },
  }
  return { db, st }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
  const E = await import('../lib/energy')
  const { LIMIT_REFUSAL } = await import('../lib/limit-texts')
  const { materialGate } = await import('../lib/limit-gate')
  const n = new Date()
  const month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  const can = (db: any, u = ME, units = 1) => quiet(() => E.canConsumeWith(db, u, 'generate_post', units))
  const commit = (db: any, d: any, u = ME) => quiet(() => E.commitConsumeWith(db, u, 'generate_post', d))
  const release = (db: any, d: any) => quiet(() => E.releaseConsumeWith(db, d))
  const counted = (st: any, u = ME) => st.counter.filter((r: any) => r.user_id === u).reduce((s: number, r: any) => s + r.count, 0)

  // ── 1. две вкладки при остатке 1: вторая получает отказ ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: '2026-10', count: 5 }, { user_id: ME, period: month, count: 4 }] })
    const a = await can(db)
    assert.equal(a.ok, true, 'вкладка 1: 9 из 10, пускаем')
    assert.ok(a.reserveId && a.period === month && a.reserveUser === ME, 'вкладка 1: бронь с ключом месяца')
    const b = await can(db)
    assert.equal(b.ok, false, 'вкладка 2: место занято бронью, отказ')
    assert.equal(b.reason, 'text_limit')
    assert.equal(b.message, LIMIT_REFUSAL.trial(10), 'текст отказа прежний')
    // параллельно (как две вкладки в одну секунду): ровно одна проходит
    const { db: db2 } = fakeDb({ counter: [{ user_id: ME, period: month, count: 9 }] })
    const both = await Promise.all([can(db2), can(db2)])
    assert.equal(both.filter(x => x.ok).length, 1, 'параллельно: проходит одна вкладка')
    // вкладка 1 дописала: счетчик 10, брони нет, следующий раз отказ
    await commit(db, a)
    assert.equal(counted(st), 10, 'после списания счетчик 10')
    assert.equal(st.reserves.length, 0, 'бронь снята списанием')
    await release(db, a)
    assert.equal(counted(st), 10, 'release после списания ничего не меняет')
    assert.equal((await can(db)).reason, 'text_limit', 'после 10 из 10 отказ')
    assert.equal(st.usage.length, 1, 'журнал usage_log: одна запись на списание')
  }

  // ── 2. упал → бронь отпущена → снова можно ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: month, count: 9 }] })
    const a = await can(db)
    assert.equal(a.ok, true)
    assert.equal((await can(db)).ok, false, 'пока идет генерация, вторая вкладка ждет')
    await release(db, a)
    assert.equal(st.reserves.length, 0, 'бронь отпущена')
    assert.equal(counted(st), 9, 'счетчик не тронут')
    const c = await can(db)
    assert.equal(c.ok, true, 'после сбоя снова можно')
  }

  // ── 3. бронь истекла сама (сервер упал и не отпустил) ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: month, count: 9 }] })
    assert.equal((await can(db)).ok, true)
    st.now += 16 * 60000
    assert.equal((await can(db)).ok, true, 'через 15 минут забытая бронь место не держит')
    assert.equal(st.reserves.length, 1, 'просроченная удалена, новая на месте')
  }

  // ── 4. набор форматов: бронь на 3, списано 2, остаток отпущен ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: month, count: 7 }] })
    const d = await can(db, ME, 3)
    assert.equal(d.ok, true, '7 + 3 = 10, пускаем')
    assert.equal((await can(db)).ok, false, 'все 10 заняты бронью')
    await commit(db, d); await commit(db, d)
    assert.equal(counted(st), 9, 'два формата записаны')
    assert.equal(st.reserves[0]?.units, 1, 'в брони остался один')
    await release(db, d)
    assert.equal(st.reserves.length, 0, 'остаток отпущен')
    assert.equal((await can(db)).ok, true, 'упавший формат не съел материал')
    // мало места на набор: частичный отказ с прежним текстом
    const { db: dbp } = fakeDb({ counter: [{ user_id: ME, period: month, count: 8 }] })
    const p = await can(dbp, ME, 3)
    assert.equal(p.reason, 'text_limit_partial')
    assert.match(p.message!, /^Пробных хватит еще на 2 текста, а форматов выбрано больше/)
    // лишний commit (бронь уже снята) все равно засчитывает выданный текст
    const { db: dbx, st: stx } = fakeDb({ counter: [{ user_id: ME, period: month, count: 0 }] })
    const x = await can(dbx)
    await commit(dbx, x); await commit(dbx, x)
    assert.equal(counted(stx), 2, 'выданный текст засчитан и без брони')
  }

  // ── 5. платный тариф: окно подписки 'w...', пробные месяцы не мешают ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: PAID, period: month, count: 10 }] })
    const d = await can(db, PAID)
    assert.equal(d.ok, true)
    assert.ok(d.period?.startsWith('w'), 'ключ брони это окно подписки')
    await commit(db, d, PAID)
    assert.equal(st.counter.find(r => r.user_id === PAID && r.period === d.period)?.count, 1, 'списано в окно')
    assert.equal(st.reserves.length, 0)
    st.counter.find(r => r.user_id === PAID && r.period === d.period)!.count = 49
    const a = await can(db, PAID)
    assert.equal(a.ok, true, '49 из 50: пускаем')
    const b = await can(db, PAID)
    assert.equal(b.reason, 'text_limit')
    assert.equal(b.message, LIMIT_REFUSAL.month, 'у платного месячный текст отказа')
  }

  // ── 6. функции нет (код раньше миграции): старый путь без брони ──
  {
    const { db, st } = fakeDb({ mode: 'missing', counter: [{ user_id: ME, period: month, count: 9 }] })
    const a = await can(db)
    assert.equal(a.ok, true, 'старый путь пускает')
    assert.equal(a.reserveId, undefined, 'брони нет')
    assert.equal((await can(db)).ok, true, 'старый путь: гонка двух вкладок остается (до миграции)')
    await commit(db, a)
    assert.equal(counted(st), 10, 'старый путь: +1 через increment_text_usage (здесь запасной upsert)')
    assert.equal((await can(db)).reason, 'text_limit', 'старый путь: после 10 отказ')
    const before = st.calls.length
    await release(db, a)
    assert.equal(st.calls.length, before, 'без брони release ничего не зовет')
  }

  // ── 7. сбой rpc (не «нет функции»): отказ server_error, мимо лимита не пускаем ──
  for (const mode of ['broken', 'throws'] as const) {
    const { db } = fakeDb({ mode, counter: [] })
    const d = await can(db)
    assert.equal(d.ok, false, `${mode}: отказ`)
    assert.equal(d.reason, 'server_error')
    assert.equal(d.message, 'Не получилось проверить остаток текстов. Попробуй еще раз через минуту.')
    // commit и release при сбое не бросают
    await commit(db, { ok: true, mode: 'text', operation: 'generate_post', cost: 0, reserveId: 'r-x', reserveUser: ME, period: month })
    await release(db, { ok: true, mode: 'text', operation: 'generate_post', cost: 0, reserveId: 'r-x', reserveUser: ME, period: month })
  }
  // ── 7а. commit упал не из-за отсутствия функции: один повтор, бронь не отпускается (место держится до истечения) ──
  for (const mode of ['broken', 'throws'] as const) {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: month, count: 3 }] })
    const d = await can(db)
    assert.ok(d.ok && d.reserveId, `${mode}: бронь есть`)
    st.mode = mode; st.calls.length = 0
    await commit(db, d)
    assert.equal(st.calls.filter((c: string) => c === 'commit_text_reserve').length, 2, `${mode}: commit повторен один раз`)
    assert.ok(!st.calls.includes('release_text_reserve'), `${mode}: бронь не отпускается`)
    assert.equal(st.reserves.length, 1, `${mode}: бронь осталась, место занято`)
    // сбой на первой попытке, вторая прошла: ровно +1
    const { db: db2, st: st2 } = fakeDb({ counter: [{ user_id: ME, period: month, count: 3 }] })
    const d2 = await can(db2)
    const rpc = db2.rpc.bind(db2); let failed = false
    db2.rpc = async (name: string, a: any) => { if (name === 'commit_text_reserve' && !failed) { failed = true; return { data: null, error: { code: '57014', message: 'canceling statement' } } } return rpc(name, a) }
    await commit(db2, d2)
    assert.equal(counted(st2), 4, 'повтор после сбоя: ровно +1')
    assert.equal(st2.reserves.length, 0, 'повтор после сбоя: бронь снята')
  }
  await E.releaseConsume(null)
  await E.releaseConsume({ ok: true, mode: 'text', operation: 'x', cost: 0 })

  // ── 8. materialGate: fail и release отпускают бронь, commit списывает и снимает остаток ──
  {
    const { db, st } = fakeDb({ counter: [{ user_id: ME, period: month, count: 9 }] })
    const deps = {
      canConsume: (u: string, op: string, units?: number) => E.canConsumeWith(db, u, op, units),
      commitConsume: (u: string, op: string, d: any) => E.commitConsumeWith(db, u, op, d),
      releaseConsume: (d: any) => E.releaseConsumeWith(db, d),
      recordFailure: async () => {},
      recordRefusal: async () => {},
    }
    const g1 = await quiet(() => materialGate(ME, 'generate_post', 1, deps))
    assert.equal(g1.ok, true)
    const g2 = await quiet(() => materialGate(ME, 'generate_post', 1, deps))
    assert.equal(g2.ok, false, 'вторая вкладка старого экрана: 429')
    if (!g2.ok) assert.equal(g2.response.status, 429)
    if (g1.ok) await quiet(() => g1.fail())
    assert.equal(st.reserves.length, 0, 'fail отпускает бронь')
    const g3 = await quiet(() => materialGate(ME, 'generate_post', 1, deps))
    if (g3.ok) await quiet(() => g3.release())
    assert.equal(st.reserves.length, 0, 'release отпускает бронь')
    const g4 = await quiet(() => materialGate(ME, 'generate_post', 1, deps))
    if (g4.ok) { await quiet(() => g4.commit()); await quiet(() => g4.fail()) }
    assert.equal(counted(st), 10, 'commit списал, fail после него ничего не делает')
    assert.equal(st.reserves.length, 0)
  }

  // ── 9. роуты: бронь отпускается на любом исходе ──
  {
    const zh13 = src('app/api/generate-post/zh13/route.ts')
    assert.match(zh13, /\} finally \{\s*await releaseConsume\(decision\)/, 'zh13: release в finally')
    const grp = src('app/api/generate-post/group/route.ts')
    assert.match(grp, /clearInterval\(ping\)[\s\S]{0,200}await releaseConsume\(decision\)/, 'group: release в finally потока')
    assert.match(grp, /'error' in tg\) \{[\s\S]{0,120}await releaseConsume\(decision\)/, 'group: release при недоступном образце')
    assert.match(grp, /if \(postId\) await commitConsume\(userId, OP, decision\)/, 'group: списание на каждый записанный формат')
    const adj = src('app/api/generate-post/adjust/route.ts')
    assert.match(adj, /\} finally \{\s*await releaseConsume\(decision\)/, 'adjust: release в finally')
    const post = src('app/api/generate-post/route.ts')
    assert.match(post, /if \(!delivered\) await gate\.release\(\)/, 'generate-post: вопрос плана без текста отпускает бронь')
    assert.match(post, /await gate\.release\(\)\s*return NextResponse\.json\(\{ error: 'Этот формат пока/, 'generate-post: неподходящий формат отпускает бронь')
    for (const f of ['generate-hooks', 'generate-carousel', 'rewrite-post', 'generate-reels', 'generate-post']) {
      assert.match(src(`app/api/${f}/route.ts`), /if \(gateFail\) await gateFail\(\)/, `${f}: catch отпускает бронь через fail`)
    }
    const mig = src('supabase/migrations/20261120100000_text_reserve.sql')
    for (const fn of ['reserve_text_usage(uuid, text, integer, integer, boolean)', 'commit_text_reserve(uuid, uuid, text, integer)', 'release_text_reserve(uuid, uuid)']) {
      assert.ok(mig.includes(`revoke execute on function public.${fn}\n  from public, anon, authenticated`), `миграция: revoke ${fn}`)
      assert.ok(mig.includes(`grant execute on function public.${fn} to service_role`), `миграция: grant ${fn}`)
    }
    assert.match(mig, /enable row level security/)
    assert.equal((mig.match(/security definer/g) || []).length, 3)
    assert.equal((mig.match(/set search_path = public/g) || []).length, 3)
  }

  console.log('test-limit-reserve: все проверки прошли')
}

main().catch(e => { console.error(e); process.exit(1) })
