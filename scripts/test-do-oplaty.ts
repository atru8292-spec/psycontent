// До оплаты (fix/do-oplaty, 12.11). Без базы, без модели, без сети.
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/test-do-oplaty.ts
// 1) разбор конкурента: шаги 2-4 только с id оплаченного шага 1 (lib/competitor-run.ts) и роут по исходнику;
// 2) атомарный счетчик материалов: incrementText зовет rpc, запасной путь без функции, миграция с revoke;
// 3) доработанный черновик (rewrite_*) это материал в «Моих текстах» и трекере, хуки нет;
// 4) materialGate.fail() и мягкий текст в catch старых роутов и разбора конкурента.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const src = (p: string) => readFileSync(join(ROOT, p), 'utf-8')
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const w = console.warn, e = console.error
  console.warn = () => {}; console.error = () => {}
  try { return await fn() } finally { console.warn = w; console.error = e }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'

  // ---------- 1. разбор конкурента ----------
  const cr = await import('../lib/competitor-run')
  const ME = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const T = 'Расшифровка ролика конкурента, достаточно длинная для проверки.'
  const NOW = Date.parse('2026-11-12T12:00:00Z')

  type Row = import('../lib/competitor-run').RunRow
  const memStore = (rows: Row[], opts: { failGet?: boolean } = {}) => {
    const calls = { claim: 0, release: 0 }
    const store: import('../lib/competitor-run').RunStore = {
      async create(userId, hash) { const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(rows.length).padStart(12, '0')}`; rows.push({ id, user_id: userId, transcript_hash: hash, paid_at: null, created_at: new Date(NOW).toISOString() }); return id },
      async markPaid(id, userId) { const r = rows.find(x => x.id === id && x.user_id === userId && !x.paid_at); if (!r) return false; r.paid_at = new Date(NOW).toISOString(); return true },
      async get(id, userId) { if (opts.failGet) return undefined; return rows.find(x => x.id === id && x.user_id === userId) ?? null },
      async claimStep(id, userId, step) { calls.claim++; const r: any = rows.find(x => x.id === id && x.user_id === userId && x.paid_at); if (!r || r[`step${step}_at`]) return false; r[`step${step}_at`] = 'x'; return true },
      async releaseStep(id, userId, step) { calls.release++; const r: any = rows.find(x => x.id === id && x.user_id === userId); if (r) r[`step${step}_at`] = null },
    }
    return { store, calls }
  }

  {
    const rows: Row[] = []
    const { store } = memStore(rows)
    const paidId = (await store.create(ME, cr.hashTranscript(T)))!
    const unpaidId = (await store.create(ME, cr.hashTranscript(T)))!
    const otherId = (await store.create(OTHER, cr.hashTranscript(T)))!
    await store.markPaid(paidId, ME)
    await store.markPaid(otherId, OTHER)
    const go = (runId: unknown, step: 2 | 3 | 4 = 2, transcript = T, now = NOW + 60_000) =>
      cr.checkContinuation(store, { runId, userId: ME, transcript, step, now })

    let r = await go(undefined)
    assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.code, 'run_required'); assert.equal(r.status, 403) }
    r = await go('не-uuid')
    assert.equal(r.ok, false, 'мусор вместо id: отказ')
    r = await go(otherId)
    assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.code, 'run_not_found', 'чужой id выглядит как несуществующий'); assert.equal(r.status, 403) }
    r = await go(unpaidId)
    assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.code, 'run_not_paid'); assert.equal(r.status, 402) }
    r = await go(paidId, 2, T + ' другое видео')
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'run_mismatch', 'другая расшифровка с тем же id: отказ')
    r = await go(paidId, 2, T, NOW + cr.RUN_MAX_AGE_MS + 1000)
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'run_expired')
    r = await go(paidId, 2)
    assert.equal(r.ok, true, 'свой оплаченный проходит')
    r = await go(paidId, 2)
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'step_used', 'шаг второй раз с тем же id: отказ')
    await store.releaseStep(paidId, ME, 2)
    r = await go(paidId, 2)
    assert.equal(r.ok, true, 'после сбоя модели (шаг освобожден) повтор проходит')
    for (const s of [3, 4] as const) assert.equal((await go(paidId, s)).ok, true, `шаг ${s} проходит`)
    // пробелы по краям расшифровки не меняют хеш
    assert.equal(cr.hashTranscript(`  ${T}\n`), cr.hashTranscript(T))
    // все тексты отказов мягкие, без кодов и английского
    for (const m of Object.values(cr.RUN_TEXTS)) assert.ok(/^[А-ЯЁ]/.test(m) && !/[A-Za-z]/.test(m) && !/[—–]/.test(m), `текст отказа: ${m}`)
  }
  {
    const { store } = memStore([], { failGet: true })
    const r = await quiet(() => cr.checkContinuation(store, { runId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000000', userId: ME, transcript: T, step: 2 }))
    assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.code, 'run_check_failed'); assert.equal(r.status, 503) }
  }
  {
    // validateRun: строка другого человека (на случай, если хранилище вернет ее) не проходит
    const row: Row = { id: 'x', user_id: OTHER, transcript_hash: cr.hashTranscript(T), paid_at: 'y', created_at: new Date(NOW).toISOString() }
    const v = cr.validateRun(row, { userId: ME, transcriptHash: cr.hashTranscript(T), step: 2, now: NOW })
    assert.equal(v.ok, false)
  }
  {
    const route = src('app/api/analyze-competitor/route.ts')
    const fetchAt = route.indexOf("fetch('https://api.openai.com")
    const checkAt = route.indexOf('checkContinuation(runs')
    assert.ok(checkAt > 0 && checkAt < fetchAt, 'роут: шаги 2-4 проверяются до модели')
    assert.ok(/runId: analysisId/.test(route), 'роут: id берется из analysisId тела')
    const createAt = route.indexOf('runs.create(user.id')
    assert.ok(createAt > route.indexOf("canConsume(user.id, 'competitor_deep')") && createAt < fetchAt, 'роут: строка разбора после проверки энергии и до модели')
    const commitAt = route.indexOf("commitConsume(user.id, 'competitor_deep'")
    const paidAt = route.indexOf('runs.markPaid(runId')
    assert.ok(commitAt > 0 && paidAt > commitAt, 'роут: оплата отмечается после списания')
    assert.ok(/if \(paid\.ok\)/.test(route.slice(commitAt, paidAt)), 'роут: отмечается только при успешном списании')
    assert.ok(paidAt < route.indexOf("data: [DONE]"), 'роут: оплата отмечена до конца потока (клиент сразу идет на шаг 2)')
    assert.ok(/'X-Analysis-Id': runId/.test(route), 'роут: id в заголовке ответа шага 1')
    assert.ok(!/error\.message|errText|OpenRouter error/.test(route), 'роут: сырых ошибок в ответе нет')
    assert.ok(/onModelFail\(\)/.test(route) && /releaseStep/.test(route), 'роут: сбой модели пишет recordFailure и освобождает шаг')
    const page = src('app/dashboard/competitor-analysis/page.tsx')
    assert.ok(/res\.headers\.get\('X-Analysis-Id'\)/.test(page), 'экран: читает id шага 1')
    assert.ok(/stepNum > 1 && analysisId \? \{ analysisId \}/.test(page), 'экран: передает id в шагах 2-4')
    const mig = src('supabase/migrations/20261112110000_competitor_runs.sql')
    assert.ok(/enable row level security/.test(mig) && /for select using \(auth\.uid\(\) = user_id\)/.test(mig), 'миграция: RLS, чтение только свое')
    assert.ok(!/for (insert|update|delete|all)/i.test(mig), 'миграция: клиентских политик записи нет')
    assert.ok(!/create (or replace )?function/i.test(mig), 'миграция: без новых функций (SECURITY DEFINER нет)')
  }

  // ---------- 2. атомарный счетчик ----------
  const energy = await import('../lib/energy')
  type Call = [string, ...any[]]
  const fakeDb = (rpcError: any, read: { data?: any; error?: any } = { data: { count: 4 } }) => {
    const calls: Call[] = []
    const chain: any = {
      select: (...a: any[]) => { calls.push(['select', ...a]); return chain },
      eq: (...a: any[]) => { calls.push(['eq', ...a]); return chain },
      maybeSingle: async () => { calls.push(['maybeSingle']); return read },
      upsert: async (...a: any[]) => { calls.push(['upsert', ...a]); return { error: null } },
    }
    const db: any = {
      rpc: async (...a: any[]) => { calls.push(['rpc', ...a]); return { data: rpcError ? null : 7, error: rpcError } },
      from: (...a: any[]) => { calls.push(['from', ...a]); return chain },
    }
    return { db, calls }
  }
  {
    const { db, calls } = fakeDb(null)
    await energy.incrementText(db, ME, '2026-11')
    assert.deepEqual(calls[0], ['rpc', 'increment_text_usage', { p_user_id: ME, p_period: '2026-11' }], 'rpc с нужными аргументами')
    assert.equal(calls.length, 1, 'при живой функции таблицу напрямую не трогает')
  }
  for (const err of [{ code: 'PGRST202', message: 'Could not find the function public.increment_text_usage' }, { code: '42883', message: 'function public.increment_text_usage(uuid, text) does not exist' }, { message: 'Could not find the function public.increment_text_usage(p_period, p_user_id) in the schema cache' }]) {
    const { db, calls } = fakeDb(err)
    await quiet(() => energy.incrementText(db, ME, '2026-11'))
    const up = calls.find(c => c[0] === 'upsert')
    assert.ok(up, `нет функции (${err.code || 'без кода'}): запасной путь`)
    assert.deepEqual(up![1], { user_id: ME, period: '2026-11', count: 5 }, 'запасной путь: прочитанное + 1')
  }
  {
    const { db, calls } = fakeDb({ code: '57014', message: 'canceling statement' })
    await quiet(() => energy.incrementText(db, ME, '2026-11'))
    assert.ok(!calls.some(c => c[0] === 'from'), 'другая ошибка rpc: запасной путь не идет (нет двойного +1)')
  }
  {
    const { db, calls } = fakeDb({ code: 'PGRST202' }, { error: { code: 'PGRST301' } })
    await quiet(() => energy.incrementText(db, ME, '2026-11'))
    assert.ok(!calls.some(c => c[0] === 'upsert'), 'запасной путь: сбой чтения, запись пропущена (не обнуляет)')
  }
  {
    const db: any = { rpc: async () => { throw new Error('network') }, from: () => { throw new Error('не должен') } }
    await quiet(() => energy.incrementText(db, ME, '2026-11'))
  }
  assert.ok(/await incrementText\(db, userId\)/.test(src('lib/energy.ts')), 'commitConsume зовет incrementText')
  {
    const mig = src('supabase/migrations/20261112100100_increment_text_usage.sql')
    assert.ok(/create or replace function public\.increment_text_usage\(p_user_id uuid, p_period text\)\s+returns integer/.test(mig))
    assert.ok(/security definer/.test(mig) && /set search_path = public/.test(mig))
    assert.ok(/on conflict \(user_id, period\)\s+do update set count = text_usage_counter\.count \+ 1\s+returning count/.test(mig), 'одна операция')
    assert.ok(/revoke execute on function public\.increment_text_usage\(uuid, text\)\s+from public, anon, authenticated;/.test(mig), 'revoke у public, anon, authenticated')
    assert.ok(/grant execute on function public\.increment_text_usage\(uuid, text\)\s+to service_role;/.test(mig), 'grant только service_role')
    const t = src('scripts/sql/test-increment-text-usage.sql')
    assert.ok(/\\i supabase\/migrations\/20261112100100_increment_text_usage\.sql/.test(t), 'SQL-тест подключает настоящую миграцию')
  }

  // ---------- 3. черновик это материал, хуки нет ----------
  const f = await import('../components/make/formats')
  assert.equal(f.toMakeFormat('rewrite_post'), 'post')
  assert.equal(f.toMakeFormat('rewrite_carousel'), 'carousel')
  assert.equal(f.toMakeFormat('rewrite_reels'), 'reels')
  assert.equal(f.toMakeFormat('rewrite_stories'), 'stories')
  assert.equal(f.toMakeFormat('reels_monolog'), 'reels')
  assert.equal(f.toMakeFormat('post_tg'), 'post_tg')
  assert.equal(f.isMaterialFormat('rewrite_post'), true)
  assert.equal(f.isMaterialFormat('hooks'), false)
  assert.equal(f.isRewriteFormat('rewrite_carousel'), true)
  assert.equal(f.isRewriteFormat('carousel'), false)
  {
    const my = src('components/texts/MyTexts.tsx')
    assert.ok(!/rewrite%/.test(my), 'Мои тексты: рерайт больше не отфильтрован')
    assert.ok(/\.neq\('format', NOT_MATERIAL_FORMAT\)/.test(my), 'Мои тексты: хуки отфильтрованы')
    assert.ok(/из черновика/.test(my), 'Мои тексты: метка «из черновика»')
    const cp = src('app/dashboard/content-plan/page.tsx')
    const q = cp.slice(cp.indexOf("from('generated_posts').select('id', { count: 'exact', head: true })"), cp.indexOf('if (planRes.data?.plan)'))
    assert.ok(q.length > 0 && !/rewrite%/.test(q), 'трекер ритма: рерайт считается')
    assert.ok(/\.not\('format', 'eq', NOT_MATERIAL_FORMAT\)/.test(q), 'трекер ритма: хуки не считаются')
    const rw = src('app/api/rewrite-post/route.ts')
    assert.ok(/format: `rewrite_\$\{format\}`/.test(rw) && /REWRITE_FORMATS\.includes/.test(rw), 'рерайт: код формата из списка')
    // лимит на хуках остался
    assert.ok(/materialGate\(userId, 'generate_hooks', 1\)/.test(src('app/api/generate-hooks/route.ts')))
  }

  // ---------- 4. fail() и мягкий текст ----------
  const lg = await import('../lib/limit-gate')
  {
    const calls = { fail: 0, commit: 0 }
    const deps = {
      canConsume: async () => ({ ok: true, mode: 'text', operation: 'x', cost: 0 }) as any,
      commitConsume: async () => { calls.commit++; return { ok: true } },
      recordFailure: async () => { calls.fail++ },
    }
    const g = await lg.materialGate(ME, 'generate_post', 1, deps)
    if (!g.ok) throw new Error('должен пустить')
    await g.fail(); await g.fail()
    assert.equal(calls.fail, 1, 'fail пишет журнал один раз')
    await g.commit()
    assert.equal(calls.commit, 0, 'после fail списания нет')
    const g2 = await lg.materialGate(ME, 'generate_post', 1, deps)
    if (!g2.ok) throw new Error('должен пустить')
    await g2.commit(); await g2.fail()
    assert.equal(calls.fail, 1, 'после commit fail ничего не пишет')
    const g3 = await lg.materialGate(ME, 'generate_post', 1, { ...deps, recordFailure: async () => { throw new Error('db') } })
    if (!g3.ok) throw new Error('должен пустить')
    await quiet(() => g3.fail())
  }
  {
    const r = lg.softFailResponse()
    assert.equal(r.status, 500)
    const b = await r.json()
    assert.equal(b.error, lg.SOFT_FAIL_TEXT)
    assert.ok(!/[—–]|(^|[^а-яё])мы(?![а-яё])|ё/i.test(lg.SOFT_FAIL_TEXT), 'мягкий текст без тире, без «мы», без ё')
    assert.equal(lg.errTag(Object.assign(new Error('Ответ модели с именем клиентки'), { code: 'ECONNRESET' })), 'ECONNRESET')
    assert.equal(lg.errTag(new TypeError('секрет')), 'TypeError', 'в журнал имя, не текст')
  }
  for (const file of ['app/api/generate-post/route.ts', 'app/api/generate-carousel/route.ts', 'app/api/generate-reels/route.ts', 'app/api/generate-hooks/route.ts', 'app/api/rewrite-post/route.ts']) {
    const s = src(file)
    const c = s.slice(s.search(/\n  \} catch \(error/))
    assert.ok(/if \(gateFail\) await gateFail\(\)/.test(c), `${file}: fail в catch`)
    assert.ok(/return softFailResponse\(\)/.test(c), `${file}: мягкий ответ в catch`)
    assert.ok(!/error\?\.message|error\.message|String\(error\)/.test(c), `${file}: без сырого error.message`)
    assert.ok(/console\.error\([^)]*errTag\(error\)\)/.test(c), `${file}: в журнал только код`)
    assert.ok(/gateFail = gate\.fail/.test(s), `${file}: fail подключен после проверки лимита`)
  }
  {
    const gp = src('app/api/generate-post/route.ts')
    assert.ok(/if \(delivered\) await gate\.commit\(\)\n      \} else \{\n        await gate\.fail\(\)/.test(gp), 'generate-post: ответ новой цепочки с ошибкой пишет fail')
  }

  console.log('test-do-oplaty: ок')
}

main().catch(e => { console.error(e); process.exit(1) })
