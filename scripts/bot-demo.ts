// Пример карточки обращения, сводки и сигнала бота поддержки на выдуманных данных (18.11, ветка feat/bot).
// Без базы и сети: npx tsx scripts/bot-demo.ts
import { buildCard, buildSummary, evaluateSignals, throttle, signalText, incidentLine, type CardAccount } from '../lib/bot/report'

const NOW = new Date('2026-11-18T09:00:00Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString()

const account: CardAccount = {
  userId: '00000000-1111-2222-3333-444455556666',
  email: 'demo.psiholog@example.ru',
  planName: 'Пробный',
  materials: { remaining: 3, cap: 10 },
  registeredAt: '2026-11-12T08:30:00Z',
  actions: [
    { at: ago(4), text: 'ошибка «Сделать»: server, пост' },
    { at: ago(6), text: 'Сделать: пост, карусель, из мысли' },
    { at: ago(30), text: 'скопировала: пост' },
    { at: ago(32), text: 'готово: 2 из 2, 41 с' },
    { at: ago(35), text: 'Сделать: пост, карусель, из темы' },
  ],
  errors: [
    { at: ago(4), text: 'ошибка «Сделать»: server, пост' },
    { at: ago(4), text: 'сбой, генерация: server' },
  ],
}

console.log('=== Карточка: новое обращение по ссылке из кабинета ===')
console.log(buildCard({ isNew: true, kind: 'photo', tgFirstName: 'Мария', account, siteUrl: 'https://psycont.ru' }))
console.log('\n=== Следующее сообщение в том же обращении ===')
console.log(buildCard({ isNew: false, kind: 'text', tgFirstName: 'Мария', account, siteUrl: 'https://psycont.ru' }))
console.log('\n=== Карточка: написали без ссылки ===')
console.log(buildCard({ isNew: true, kind: 'voice', tgFirstName: 'Олег', account: null, siteUrl: 'https://psycont.ru' }))

console.log('\n=== Утренняя сводка ===')
console.log(buildSummary({
  mode: 'morning', label: '17 ноября',
  registered: 4, firstText: 2, copies: 9, trialEnd: 1,
  payFirst: 1, payRenewal: 0, payFailed: 1, refunds: 0, autoOff: 0,
  texts: 23, incidents: { gen: 3, openai: 1 },
  aiRubDay: 186.4, aiRubMonth: 3120, unanswered: 1,
}))

console.log('\n=== Сводка в тихий день (нули не показываются, кроме регистраций) ===')
console.log(buildSummary({
  mode: 'morning', label: '16 ноября',
  registered: 0, firstText: 0, copies: 0, trialEnd: 0, payFirst: 0, payRenewal: 0, payFailed: 0, refunds: 0, autoOff: 0,
  texts: 0, incidents: {}, aiRubDay: 0, aiRubMonth: 0, unanswered: 0,
}))

console.log('\n=== Сигналы ===')
const sig = evaluateSignals({ streak: 3, genHour: 4, fresh: [{ kind: 'openai', code: 'openai_429_insufficient_quota' }, { kind: 'pay_webhook', code: '403_bad_ip' }] })
for (const s of sig) {
  const t = throttle({ last_sent_at: ago(40), suppressed: 5 }, NOW, s.n)
  console.log(signalText(s, t.repeats))
  console.log('---')
}

console.log('\n=== /oshibki ===')
console.log([
  incidentLine({ kind: 'gen', code: 'server', created_at: ago(4) }),
  incidentLine({ kind: 'openai', code: 'openai_429_insufficient_quota', created_at: ago(20) }),
  incidentLine({ kind: 'pay_webhook', code: '403_bad_ip', created_at: ago(90) }),
].join('\n'))
