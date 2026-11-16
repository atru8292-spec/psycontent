// Тест безопасных ошибок (16.11): ни текст ответа модели, ни кусок запроса не попадают в сообщение и метку.
// Запуск: npx tsx scripts/test-safe-error.ts
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CodedError, openAiError, errTag } from '../lib/safe-error'

const SECRET = 'Клиентка Мария рассказала про развод'

// 1. Ошибка OpenAI: только статус и код из словаря OpenAI
const body = JSON.stringify({ error: { message: `Bad request: ${SECRET}`, type: 'invalid_request_error', code: 'context_length_exceeded' } })
const e1 = openAiError(400, body)
assert.equal(e1.code, 'openai_400_context_length_exceeded')
assert.equal(e1.status, 400)
assert.ok(!e1.message.includes('Мария') && !String(e1.stack).includes('Мария'), 'текст ответа в сообщении')
assert.equal(errTag(e1), 'openai_400_context_length_exceeded')
assert.equal(openAiError(429, 'не JSON ' + SECRET).code, 'openai_429')
assert.equal(openAiError(401).code, 'openai_401')

// 2. Метка любой ошибки без сообщения
assert.equal(errTag(new Error(`Unexpected token 'К', "${SECRET}" is not valid JSON`)), 'Error')
assert.equal(errTag(new SyntaxError(SECRET)), 'SyntaxError')
assert.equal(errTag({ code: 'PGRST116', message: SECRET }), 'PGRST116')
assert.equal(errTag(new CodedError('openai_bad_json')), 'openai_bad_json')
assert.equal(errTag(undefined), 'undefined')
assert.ok(!errTag({ code: `x ${SECRET}` }).includes('Мария'))

// 3. В коде сервера не осталось журналов с сырым сообщением ошибки или телом ответа
const bad = /console\.(error|warn|log)\([^)]*(\.message\b|rawText|raw\.slice|errText)/
const rawObj = /console\.(error|warn)\([^)]*, (e|err|error)\)/
const leaks: string[] = []
function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!p.endsWith('.ts') || p.includes('/test')) continue
    readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (p.endsWith('app/api/health/route.ts')) return // код и 80 знаков ответа базы, без данных людей
      if (bad.test(l) || rawObj.test(l)) leaks.push(`${p}:${i + 1}`)
    })
  }
}
walk('app/api'); walk('lib')
assert.deepEqual(leaks, [], 'сырые ошибки в журнале:\n' + leaks.join('\n'))

// 4. Человеку из роутов не уходит error.message
const human = /(error|message): *(e|err|error)(\?)?\.message/
const toHuman: string[] = []
function walk2(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { walk2(p); continue }
    if (!p.endsWith('.ts')) continue
    readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (human.test(l) && !l.includes("startsWith('Пока нет')")) toHuman.push(`${p}:${i + 1}`) })
  }
}
walk2('app/api')
assert.deepEqual(toHuman, [], 'сырые ошибки человеку:\n' + toHuman.join('\n'))

console.log('test-safe-error: все проверки прошли')
