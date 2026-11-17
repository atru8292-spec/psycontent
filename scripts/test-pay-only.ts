// Оплата только для тестовых почт (PAY_ONLY_EMAILS). npx tsx scripts/test-pay-only.ts
import assert from 'node:assert/strict'
import { payAllowedFor } from '../lib/billing/ready'
delete process.env.PAY_ONLY_EMAILS
assert.equal(payAllowedFor('anna@mail.ru'), true, 'без списка оплата для всех')
process.env.PAY_ONLY_EMAILS = 'atru8292+*@gmail.com'
for (const e of ['atru8292+test1@gmail.com', 'ATRU8292+oplata@gmail.com']) assert.equal(payAllowedFor(e), true, e)
for (const e of ['atru8292@gmail.com', 'etomath4@gmail.com', 'anna@mail.ru', 'atru8292+x@gmail.com.evil.ru', 'xatru8292+1@gmail.com', '', null])
  assert.equal(payAllowedFor(e as any), false, String(e))
process.env.PAY_ONLY_EMAILS = 'a@b.ru, atru8292+*@gmail.com'
assert.equal(payAllowedFor('a@b.ru'), true); assert.equal(payAllowedFor('a@bxru'), false, 'точка не любой символ')
console.log('test-pay-only: ок')
