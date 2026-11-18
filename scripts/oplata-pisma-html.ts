// Письма об оплате в HTML для просмотра и снимков (19.11): npx tsx scripts/oplata-pisma-html.ts <папка>
// Данные тестовые, ничего не отправляет.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPayMail } from '../lib/billing/mail-render'
import { PAID_NEXT_MANUAL } from '../lib/billing/mail-texts'

const out = process.argv[2]
mkdirSync(out, { recursive: true })
const site = 'https://psycont.ru'
const LIST: [string, string, Record<string, string>][] = [
  ['1-paid', 'paid', { plan: 'Спокойный ритм', amount: '1 290 ₽', until: '20 декабря', next: PAID_NEXT_MANUAL, method: ' через СБП' }],
  ['2-end_soon', 'end_soon', { plan: 'Спокойный ритм', code: 'start', date: '20 декабря' }],
  ['3-end_today', 'end_today', { plan: 'Спокойный ритм', code: 'start', date: '20 декабря', day: 'Сегодня' }],
  ['4-ended', 'ended', { plan: 'Спокойный ритм', code: 'start', date: '20 декабря' }],
  ['5-receipt', 'receipt', { url: 'https://lknpd.nalog.ru/api/v1/receipt/000000000000/200abc1234/print' }],
]
for (const [file, kind, data] of LIST) {
  const m = renderPayMail(kind, data, site)!
  writeFileSync(join(out, `${file}.html`), m.html)
  writeFileSync(join(out, `${file}.txt`), `Тема: ${m.subject}\nПрехедер: ${m.preheader}\n\n${m.text}`)
}
console.log('писем:', LIST.length)
