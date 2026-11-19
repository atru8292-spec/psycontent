// Проверка писем об оплате (17.11): все 7 видов собираются на тестовых данных, нет тире и ё, нет незаполненных
// подстановок и слова ЧЕРНОВИК, размер меньше 100 КБ (Gmail обрезает от 102), ссылки только https, данные экранируются,
// чек без ссылки не собирается. npx tsx scripts/test-pisma.ts
import assert from 'node:assert/strict'
import { renderPayMail } from '../lib/billing/mail-render'
import { MAIL, DRAFT, PAID_NEXT_MANUAL } from '../lib/billing/mail-texts'

const site = 'https://psycont.ru'
const DATA: Record<string, Record<string, string>> = {
  paid: { plan: 'Спокойный ритм', amount: '1 290 ₽', until: '17 декабря', next: 'Следующее списание 17 декабря, 1 290 ₽' },
  reminder: { plan: 'Спокойный ритм', amount: '1 290 ₽', date: '17 декабря' },
  charge_failed: { plan: 'Спокойный ритм', amount: '1 290 ₽', retry: '18 декабря' },
  charge_failed_final: { plan: 'Спокойный ритм', amount: '1 290 ₽' },
  autorenew_off: { until: '17 декабря' },
  receipt: { url: 'https://lknpd.nalog.ru/api/v1/receipt/222260732304/200abc1234/print' },
  refund: { amount: '817 ₽', days: '19' },
  refund_future: { amount: '1 290 ₽', plan: 'Спокойный ритм', until: '17 декабря' },
  end_soon: { plan: 'Спокойный ритм', code: 'start', date: '20 декабря' },
  end_today: { plan: 'Спокойный ритм', code: 'start', date: '20 декабря', day: 'Сегодня' },
  ended: { plan: 'Спокойный ритм', code: 'start', date: '20 декабря' },
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
{ // возврат продления, которое не началось: без «выключен» и «новый чек на оставшуюся сумму», с датой и суммой
  const rf = renderPayMail('refund_future', DATA.refund_future, site)!
  assert.ok(!rf.html.includes('btn-text"'), 'в возврате продления кнопки нет')
  assert.ok(!/выключ|оставш/i.test(rf.text + rf.subject), 'нет «выключен» и «оставшуюся сумму»')
  assert.ok(rf.text.includes('Возврат 1 290 ₽ за продление оформлен') && rf.text.includes('работает до 17 декабря, как и раньше'), 'сумма и дата')
}
const x = renderPayMail('paid', { ...DATA.paid, plan: '<script>alert(1)</script>' }, site)!
assert.ok(!x.html.includes('<script>alert') && x.html.includes('&lt;script&gt;'), 'экранирование')
assert.equal(renderPayMail('receipt', { url: 'javascript:alert(1)' }, site), null, 'чек без https не собирается')
assert.equal(renderPayMail('receipt', { url: '' }, site), null, 'чек без ссылки не собирается')
// прехедер: главная фраза до 90 знаков; плашка paid без повтора тарифа; способ оплаты встает в фразу
for (const [k, d] of Object.entries(DATA)) { const m = renderPayMail(k, d, site)!; assert.ok(m.preheader.length > 10 && m.preheader.length <= 90, `${k}: прехедер ${m.preheader.length}`); assert.ok(!m.html.includes('&#847;'), `${k}: пустые заполнители`) }
const pd = renderPayMail('paid', { ...DATA.paid, next: 'Следующее списание 17 декабря, 1 290 ₽.', method: ' с карты •• 4242' }, site)!
assert.ok(pd.text.includes('Оплата 1 290 ₽ с карты •• 4242 прошла, тариф работает до 17 декабря.'), 'плашка paid')
assert.ok(renderPayMail('reminder', { ...DATA.reminder, method: ' через СБП' }, site)!.text.includes('17 декабря спишется 1 290 ₽ через СБП за следующий месяц'))
assert.ok(renderPayMail('charge_failed', DATA.charge_failed, site)!.text.includes('Банк не дал списать 1 290 ₽ за тариф'), 'без способа строка прежняя')
assert.ok(renderPayMail('charge_failed', DATA.charge_failed, site)!.text.includes('за тариф «Спокойный ритм». Чаще всего на карте не хватило денег или у нее закончился срок.'), 'карта: прежняя причина')
assert.ok(renderPayMail('charge_failed', { ...DATA.charge_failed, method: ' через СБП' }, site)!.text.includes('Банк не дал списать 1 290 ₽ через СБП за тариф «Спокойный ритм». Чаще всего на счете не хватило денег или банк временно не отвечает.'), 'СБП: своя причина')
// ручное продление (19.11): кнопка ведет прямо на оплату тарифа, в письмах нет слов про списания и автопродление
for (const k of ['end_soon', 'end_today', 'ended']) {
  const m = renderPayMail(k, DATA[k], site)!
  assert.ok(m.text.includes('https://psycont.ru/dashboard/oplata?plan=start'), `${k}: кнопка на оплату`)
  assert.ok(!/автопродл|спишем|списани[ея]|карт[аыу]/i.test(m.subject + m.text), `${k}: без автосписаний`)
}
assert.ok(renderPayMail('end_today', DATA.end_today, site)!.subject.startsWith('Сегодня последний день тарифа'))
const pm = renderPayMail('paid', { ...DATA.paid, next: PAID_NEXT_MANUAL }, site)!
assert.ok(pm.text.includes('Сам тариф не продлится') && !/Следующее списание/.test(pm.text), 'paid без строки о следующем списании')
console.log('test-pisma: все проверки прошли')
