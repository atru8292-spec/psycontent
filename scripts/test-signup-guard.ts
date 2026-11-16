// Тест защиты регистрации (16.11): ловушка, скорость, пределы по адресу и общий, капча. npx tsx scripts/test-signup-guard.ts
import assert from 'node:assert/strict'
import { checkSignup, recordSignup, captchaOk, clientIp, MIN_FORM_MS, PER_IP_HOUR, PER_IP_DAY, ALL_HOUR } from '../lib/signup-guard'

const fresh = () => ({ ip: new Map<string, number[]>(), all: [] as number[] })
const T0 = 1_800_000_000_000
;(async () => {
  let st = fresh()
  assert.deepEqual(checkSignup({ ip: '1.1.1.1', honeypot: 'http://spam', formMs: 9000, now: T0 }, st), { ok: false, reason: 'honeypot' })
  assert.deepEqual(checkSignup({ ip: '1.1.1.1', formMs: MIN_FORM_MS - 1, now: T0 }, st), { ok: false, reason: 'too_fast' })
  assert.deepEqual(checkSignup({ ip: '1.1.1.1', formMs: 'x', now: T0 }, st), { ok: false, reason: 'too_fast' })
  assert.deepEqual(checkSignup({ ip: '1.1.1.1', honeypot: '', formMs: 8000, now: T0 }, st), { ok: true })

  // предел в час с одного адреса, другой адрес проходит
  for (let i = 0; i < PER_IP_HOUR; i++) recordSignup('2.2.2.2', T0 + i, st)
  assert.deepEqual(checkSignup({ ip: '2.2.2.2', formMs: 8000, now: T0 + 100 }, st), { ok: false, reason: 'ip_limit' })
  assert.deepEqual(checkSignup({ ip: '3.3.3.3', formMs: 8000, now: T0 + 100 }, st), { ok: true })
  // через час снова можно, пока не набран суточный предел
  assert.deepEqual(checkSignup({ ip: '2.2.2.2', formMs: 8000, now: T0 + 3600e3 + 10 }, st), { ok: true })
  st = fresh()
  for (let i = 0; i < PER_IP_DAY; i++) recordSignup('4.4.4.4', T0 + i * 3 * 3600e3 / 3, st)
  assert.equal(checkSignup({ ip: '4.4.4.4', formMs: 8000, now: T0 + PER_IP_DAY * 3600e3 + 1 }, st).ok, false)

  // общий предел
  st = fresh()
  for (let i = 0; i < ALL_HOUR; i++) recordSignup(`9.9.${i}.1`, T0 + i, st)
  assert.deepEqual(checkSignup({ ip: '8.8.8.8', formMs: 8000, now: T0 + 1000 }, st), { ok: false, reason: 'all_limit' })

  // капча: без ключа выключена; с ключом пустой токен нет, ответ ok да, сбой сервиса не закрывает регистрацию
  delete process.env.SMARTCAPTCHA_SERVER_KEY
  assert.equal(await captchaOk('', '1.1.1.1'), true)
  process.env.SMARTCAPTCHA_SERVER_KEY = 'test'
  const fake = (status: number, body: any) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  assert.equal(await captchaOk('', '1.1.1.1', fake(200, { status: 'ok' })), false)
  assert.equal(await captchaOk('tok', '1.1.1.1', fake(200, { status: 'ok' })), true)
  assert.equal(await captchaOk('tok', '1.1.1.1', fake(200, { status: 'failed' })), false)
  assert.equal(await captchaOk('tok', '1.1.1.1', fake(500, {})), true)
  delete process.env.SMARTCAPTCHA_SERVER_KEY

  const h = new Headers({ 'x-forwarded-for': '5.5.5.5, 10.0.0.1' })
  assert.equal(clientIp(h), '5.5.5.5')
  assert.equal(clientIp(new Headers({ 'x-real-ip': '6.6.6.6', 'x-forwarded-for': '5.5.5.5' })), '6.6.6.6')
  console.log('test-signup-guard: ок')
})()
