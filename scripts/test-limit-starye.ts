// Лимит материалов в старых генераторах (fix/limit-starye, 12.11). Без базы и без модели.
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/test-limit-starye.ts
// 1) помощник materialGate с фейковыми deps; 2) по исходникам пяти роутов: op, units 1, проверка до модели
// и до записи, списание после записи, второго canConsume нет; 3) все пять op текстовые.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const src = (p: string) => readFileSync(join(ROOT, p), 'utf-8')

type D = { ok: boolean; mode: any; operation: string; cost: number; reason?: string; message?: string }

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
  const { materialGate } = await import('../lib/limit-gate')
  const { OPERATIONS } = await import('../lib/energy')

  // ---------- 1. помощник ----------
  const mk = (decision: D) => {
    const calls = { can: [] as any[], commit: [] as any[], refusal: [] as any[] }
    const deps = {
      canConsume: async (u: string, op: string, units?: number) => { calls.can.push([u, op, units]); return decision as any },
      commitConsume: async (u: string, op: string, d: any) => { calls.commit.push([u, op, d]); return { ok: true } },
      recordRefusal: async (u: string, op: string) => { calls.refusal.push([u, op]) },
    }
    return { deps, calls }
  }

  {
    const msg = 'Пробные материалы закончились, все 10 уже собраны.'
    const { deps, calls } = mk({ ok: false, mode: 'text', operation: 'generate_post', cost: 0, reason: 'text_limit', message: msg })
    const g = await materialGate('u1', 'generate_post', 1, deps)
    assert.equal(g.ok, false)
    if (g.ok) throw new Error('unreachable')
    assert.equal(g.response.status, 429, 'без остатка: 429')
    const body = await g.response.json()
    assert.equal(body.error, msg, 'текст отказа в поле error (старые экраны показывают data.error)')
    assert.equal(body.limit, true)
    assert.equal(body.code, 'text_limit')
    assert.equal(calls.commit.length, 0, 'без остатка commit не вызывается')
    assert.deepEqual(calls.can[0], ['u1', 'generate_post', 1])
    assert.equal(calls.refusal.length, 1, 'отказ пишется в журнал')
  }
  {
    const decision: D = { ok: true, mode: 'text', operation: 'generate_reels', cost: 0 }
    const { deps, calls } = mk(decision)
    const g = await materialGate('u2', 'generate_reels', 1, deps)
    assert.equal(g.ok, true)
    if (!g.ok) throw new Error('unreachable')
    assert.equal(calls.commit.length, 0, 'до commit ничего не списано')
    await g.commit()
    await g.commit()
    assert.equal(calls.commit.length, 1, 'commit списывает ровно один раз')
    assert.equal(calls.commit[0][0], 'u2')
    assert.equal(calls.commit[0][1], 'generate_reels')
    assert.equal(calls.commit[0][2], decision, 'тот же decision')
  }
  {
    const { deps, calls } = mk({ ok: false, mode: 'text', operation: 'rewrite_post', cost: 0, reason: 'server_error', message: 'Не получилось проверить остаток материалов. Попробуй еще раз через минуту.' })
    const g = await materialGate('u3', 'rewrite_post', 1, deps)
    assert.equal(g.ok, false)
    if (g.ok) throw new Error('unreachable')
    assert.equal(g.response.status, 429, 'сбой чтения счетчика: 429, не 200')
    const body = await g.response.json()
    assert.equal(body.code, 'server_error')
    assert.match(body.error, /^Не получилось проверить остаток/)
    assert.equal(calls.commit.length, 0)
  }
  {
    // отказ без message: запасной текст; сбой журнала отказа не роняет ответ
    const deps = {
      canConsume: async () => ({ ok: false, mode: 'text', operation: 'x', cost: 0, reason: 'text_limit' }) as any,
      commitConsume: async () => ({ ok: true }),
      recordRefusal: async () => { throw new Error('db down') },
    }
    const g = await materialGate('u4', 'generate_hooks', 1, deps)
    if (g.ok) throw new Error('должен быть отказ')
    assert.equal((await g.response.json()).error, 'Материалы закончились')
  }
  {
    // сбой списания после готового текста не бросается (не превращается в 500)
    const deps = {
      canConsume: async () => ({ ok: true, mode: 'text', operation: 'x', cost: 0 }) as any,
      commitConsume: async () => { throw Object.assign(new Error('boom'), { code: 'PGRST301' }) },
    }
    const g = await materialGate('u5', 'generate_carousel', 1, deps)
    if (!g.ok) throw new Error('должен пустить')
    const origErr = console.error; console.error = () => {}
    try { await g.commit() } finally { console.error = origErr }
  }
  {
    // реальный canConsume: на сбое базы (адрес 127.0.0.1:9 не отвечает) отказ, а не пропуск
    const origWarn = console.warn; console.warn = () => {}
    try {
      const g = await materialGate('00000000-0000-0000-0000-000000000000', 'generate_post', 1, {
        canConsume: (await import('../lib/energy')).canConsume,
        commitConsume: async () => { throw new Error('не должен вызываться') },
      })
      assert.equal(g.ok, false, 'база недоступна: помощник не пускает')
      if (!g.ok) assert.notEqual(g.response.status, 200)
    } catch (e: any) {
      // провал самой проверки не глотаем (ревью 12.11: раньше catch съедал и AssertionError)
      if (e?.code === 'ERR_ASSERTION') throw e
      // если canConsume бросил раньше счетчика (чтение плана), роут уйдет в свой catch с 500: тоже не 200
      assert.ok(e, 'сбой базы не дает 200')
    } finally { console.warn = origWarn }
  }

  // ---------- 2. роуты по исходникам ----------
  const ROUTES: { file: string; op: string; model: RegExp[]; write: RegExp[] }[] = [
    { file: 'app/api/generate-post/route.ts', op: 'generate_post', model: [/handleNewPipeline\(\{/, /generateWithAI\(/], write: [/from\('generated_posts'\)\.insert/] },
    { file: 'app/api/generate-carousel/route.ts', op: 'generate_carousel', model: [/generateWithAI\(/], write: [/from\('generated_posts'\)\.insert/] },
    { file: 'app/api/generate-reels/route.ts', op: 'generate_reels', model: [/generateWithAI\(/], write: [/from\('generated_posts'\)\.insert/] },
    { file: 'app/api/generate-hooks/route.ts', op: 'generate_hooks', model: [/generateWithAI\(/], write: [/from\('generated_posts'\)\.insert/] },
    { file: 'app/api/rewrite-post/route.ts', op: 'rewrite_post', model: [/generateWithAI\(/], write: [/from\('generated_posts'\)\.insert/] },
  ]
  const at = (s: string, re: RegExp, from = 0) => { const i = s.slice(from).search(re); return i < 0 ? -1 : i + from }
  for (const r of ROUTES) {
    const full = src(r.file)
    const post = full.slice(full.indexOf('export async function POST'))
    assert.ok(post.length > 100, `${r.file}: POST найден`)
    const gateCalls = post.match(/materialGate\(/g) || []
    assert.equal(gateCalls.length, 1, `${r.file}: помощник ровно один раз`)
    const call = post.match(/materialGate\(\s*userId\s*,\s*'([a-z_]+)'\s*,\s*(\d+)\s*\)/)
    assert.ok(call, `${r.file}: вызов materialGate(userId, op, units)`)
    assert.equal(call![1], r.op, `${r.file}: op`)
    assert.equal(call![2], '1', `${r.file}: units 1`)
    assert.ok(!/canConsume\(/.test(full), `${r.file}: второго canConsume нет`)
    assert.ok(!/commitConsume\(/.test(full), `${r.file}: commitConsume напрямую не зовется`)
    const gateAt = post.search(/materialGate\(/)
    assert.ok(/if \(!gate\.ok\) return gate\.response/.test(post.slice(gateAt, gateAt + 200)), `${r.file}: отказ сразу возвращается`)
    for (const m of r.model) {
      const i = at(post, m)
      assert.ok(i > gateAt, `${r.file}: проверка лимита до ${m}`)
    }
    const writeAt = at(post, r.write[0])
    assert.ok(writeAt > gateAt, `${r.file}: проверка до записи`)
    const commits = [...post.matchAll(/gate\.commit\(\)/g)].map(x => x.index!)
    assert.ok(commits.length >= 1, `${r.file}: commit есть`)
    if (r.op === 'generate_post') {
      // две ветки: новая цепочка (commit после handleNewPipeline, запись внутри нее) и старый путь (после insert)
      assert.equal(commits.length, 2, 'generate-post: commit в двух ветках, по одному на ветку')
      const hnp = at(post, /handleNewPipeline\(\{/)
      assert.ok(commits[0] > hnp, 'новая цепочка: commit после handleNewPipeline (там savePost)')
      const retNew = at(post, /return res\b/, hnp)
      assert.ok(commits[0] < retNew, 'новая цепочка: commit до return res')
      assert.ok(/delivered/.test(post.slice(hnp, commits[0])), 'новая цепочка: commit только при готовом post')
      assert.ok(commits[1] > writeAt, 'старый путь: commit после insert')
      const oldModel = at(post, /generateWithAI\(/)
      assert.ok(oldModel > retNew, 'старый путь идет после ветки новой цепочки')
    } else {
      assert.equal(commits.length, 1, `${r.file}: один commit`)
      assert.ok(commits[0] > writeAt, `${r.file}: commit после записи`)
      const modelAt = at(post, r.model[0])
      assert.ok(commits[0] > modelAt, `${r.file}: commit после модели`)
    }
    // commit не в catch: при падении модели списания нет
    const catchAt = post.search(/\n  \} catch \(error/)
    assert.ok(catchAt > 0 && commits.every(c => c < catchAt), `${r.file}: commit не в catch`)
  }
  // handleNewPipeline (и sync-режим внутри) сам не считает: один раз на запрос в route.ts
  const np = src('app/api/generate-post/new-pipeline.ts')
  assert.ok(!/canConsume|commitConsume|materialGate/.test(np), 'new-pipeline.ts без своего лимита (без двойного списания)')
  // служебные роуты не тронуты
  for (const f of ['app/api/generate-content-plan/route.ts', 'app/api/generate-carousel-topics/route.ts', 'app/api/research-topics/route.ts', 'app/api/generate-passport/route.ts']) {
    assert.ok(!/materialGate|canConsume|commitConsume/.test(src(f)), `${f}: не списывает`)
  }

  // ---------- 3. все op текстовые ----------
  for (const r of ROUTES) assert.equal(OPERATIONS[r.op]?.kind, 'text', `${r.op}: kind text`)

  // старые экраны показывают текст отказа из data.error
  for (const p of ['app/dashboard/hooks-generator/page.tsx', 'app/dashboard/rewrite/page.tsx', 'app/dashboard/reels/page.tsx', 'app/dashboard/carousel-generator/page.tsx']) {
    assert.ok(/throw new Error\(data\.error \|\|/.test(src(p)), `${p}: показывает data.error`)
  }
  assert.ok(/Материалы на этот месяц\|Не получилось проверить остаток/.test(src('app/dashboard/make/page.tsx')), 'make: отказ платных и сбой счетчика показываются как есть')

  console.log('test-limit-starye: ок')
}

main().catch(e => { console.error(e); process.exit(1) })
