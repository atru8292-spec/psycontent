// Проверка писем об оплате (17.11): все 7 видов собираются на тестовых данных, нет тире и ё, нет незаполненных
// подстановок и слова ЧЕРНОВИК, размер меньше 100 КБ (Gmail обрезает от 102), ссылки только https, данные экранируются,
// чек без ссылки не собирается. npx tsx scripts/test-pisma.ts
import assert from 'node:assert/strict'
import { renderPayMail } from '../lib/billing/mail-render'
import { MAIL, DRAFT } from '../lib/billing/mail-texts'

const site = 'https://psycont.ru'
const DATA: Record<string, Record<string, string>> = {
  paid: { plan: 'Спокойный ритм', amount: '1 290 ₽', until: '17 декабря', next: 'Следующее списание 17 декабря, 1 290 ₽' },
  reminder: { plan: 'Спокойный ритм', amount: '1 290 ₽', date: '17 декабря' },
  charge_failed: { plan: 'Спокойный ритм', amount: '1 290 ₽', retry: '18 декабря' },
  charge_failed_final: { plan: 'Спокойный ритм', amount: '1 290 ₽' },
  autorenew_off: { until: '17 декабря' },
  receipt: { url: 'https://lknpd.nalog.ru/api/v1/receipt/222260732304/200abc1234/print' },
  refund: { amount: '817 ₽', days: '19' },
}
assert.equal(DRAFT, false)
assert.deepEqual(Object.keys(MAIL).sort(), Object.keys(DATA).sort(), 'все виды писем проверены')
for (const [k, d] of Object.entries(DATA)) {
  const m = renderPayMail(k, d, site)!
  assert.ok(m, k)
  const all = m.html + m.text + m.subject
  assert.ok(!/[—–ё]/i.test(all), `${k}: тире или ё`)
  assert.ok(!/\{[a-z]+\}/.test(all), `${k}: незаполненная подстановка`)
  assert.ok(!/ЧЕРНОВИК/.test(all), `${k}: черновик`)
  assert.ok(Buffer.byteLength(m.html) < 100 * 1024, `${k}: тяжелое письмо`)
  for (const h of m.html.match(/href="([^"]+)"/g) || []) assert.ok(/^href="https:\/\//.test(h), `${k}: ссылка не https ${h}`)
  assert.ok(m.html.includes('Это служебное письмо об оплате PsyCont') && m.html.includes('ИНН&nbsp;'), `${k}: подвал`)
  assert.ok(m.html.includes('alt="PsyCont"'), `${k}: alt логотипа`)
  if (MAIL[k].button) assert.ok(m.text.includes(`${MAIL[k].button!.label}: https://`), `${k}: кнопка в тексте`)
}
assert.ok(!renderPayMail('refund', DATA.refund, site)!.html.includes('btn-text"'), 'в возврате кнопки нет')
const x = renderPayMail('paid', { ...DATA.paid, plan: '<script>alert(1)</script>' }, site)!
assert.ok(!x.html.includes('<script>alert') && x.html.includes('&lt;script&gt;'), 'экранирование')
assert.equal(renderPayMail('receipt', { url: 'javascript:alert(1)' }, site), null, 'чек без https не собирается')
assert.equal(renderPayMail('receipt', { url: '' }, site), null, 'чек без ссылки не собирается')
console.log('test-pisma: все проверки прошли')
