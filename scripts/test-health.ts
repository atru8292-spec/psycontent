// Тест /api/health без сети и без настоящей базы: локальный сервер притворяется PostgREST.
// ok 200 при ответе базы 200, fail 503 при ошибке базы, при недоступной базе и без настроек; в ответе нет данных.
//   ~/.npm/_npx/*/node_modules/.bin/tsx scripts/test-health.ts
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

async function main() {
  let mode: 'ok' | 'err' = 'ok'
  let hits = 0
  const srv = createServer((req, res) => {
    hits++
    assert.ok(req.url?.startsWith('/rest/v1/plans'), `запрос только к plans: ${req.url}`)
    if (mode === 'ok') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[{"code":"free"}]') }
    else { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"code":"XX000","message":"boom"}') }
  })
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()))
  const port = (srv.address() as any).port
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon'
  process.env.HEALTH_TTL_MS = '0'
  const { GET } = await import('../app/api/health/route')
  const call = async () => { const r = await GET(); return [r.status, await r.text(), r.headers.get('cache-control')] as const }

  assert.deepEqual(await call(), [200, 'ok', 'no-store'], 'база отвечает: ok 200')
  mode = 'err'
  assert.deepEqual(await call(), [503, 'fail', 'no-store'], 'база с ошибкой: fail 503, без текста ошибки')
  srv.close()
  assert.deepEqual(await call(), [503, 'fail', 'no-store'], 'база недоступна: fail 503')
  // кеш: при TTL 10 с второй запрос не идет в базу
  process.env.HEALTH_TTL_MS = '10000'
  const srv2 = createServer((_q, s) => { hits++; s.writeHead(200, { 'Content-Type': 'application/json' }); s.end('[]') })
  await new Promise<void>(r => srv2.listen(port, '127.0.0.1', () => r()))
  process.env.HEALTH_TTL_MS = '0'; mode = 'ok'
  await call()
  process.env.HEALTH_TTL_MS = '10000'
  const before = hits
  assert.deepEqual(await call(), [200, 'ok', 'no-store'])
  assert.equal(hits, before, 'в пределах 10 с база не спрашивается повторно')
  srv2.close()
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.HEALTH_TTL_MS = '0'
  assert.deepEqual(await call(), [503, 'fail', 'no-store'], 'без настроек: fail 503')
  console.log('ok: /api/health отдает только ok или fail, кеш 10 с работает')
}
main().catch(e => { console.error(e); process.exit(1) })
